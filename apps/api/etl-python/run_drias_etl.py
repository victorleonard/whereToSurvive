#!/usr/bin/env python3
"""
ETL DRIAS / Explore2 via l'API RADIS (api.g-eau.fr).

Ensemble multi-modèles (3 chaînes ADAMONT / RCP4.5) :
  - CNRM-CM5 / ALADIN63
  - EC-EARTH / RCA4
  - MPI-ESM-LR / REMO2009

Variables d'environnement :
  ETL_HORIZON=2030|2050|all  → horizon (défaut: 2050 ; all = les deux)
  DRIAS_ENSEMBLE=0          → une seule chaîne (CNRM-ALADIN63)
  ETL_LIMIT=N               → max de nouvelles communes à fetcher (dev)
  DRIAS_CHECKPOINT=path     → fichier JSONL de reprise
  DRIAS_SKIP_EXISTING=1     → ne pas re-fetcher si déjà dans le checkpoint (défaut: 1)
  DRIAS_FORCE=1             → ignore le checkpoint / refetch tout
"""

from __future__ import annotations

import json
import math
import os
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import psycopg
import requests
from netCDF4 import Dataset
from pyproj import Transformer

DRIAS_BASE = "https://api.g-eau.fr/drias_daily"
BC = "ADAMONT"
RCP = "rcp45"
PAD_M = 4000

# Décennies alignées TRACC / Climadiag
HORIZON_PERIODS: dict[str, tuple[str, str]] = {
    "2030": ("2020-01-01", "2029-12-31"),
    "2050": ("2040-01-01", "2049-12-31"),
}

ENSEMBLE_CHAINS: list[tuple[str, str]] = [
    ("CNRM-CERFACS-CNRM-CM5", "CNRM-ALADIN63"),
    ("ICHEC-EC-EARTH", "SMHI-RCA4"),
    ("MPI-M-MPI-ESM-LR", "MPI-CSC-REMO2009"),
]

USE_ENSEMBLE = os.environ.get("DRIAS_ENSEMBLE", "1") != "0"
CHAINS = ENSEMBLE_CHAINS if USE_ENSEMBLE else [ENSEMBLE_CHAINS[0]]
SOURCE = (
    f"drias-explore2-hydro-ensemble-{len(CHAINS)}"
    if len(CHAINS) > 1
    else "drias-explore2-hydro"
)
SOURCE_LEGACY = (
    f"drias-explore2-radis-ensemble-{len(CHAINS)}"
    if len(CHAINS) > 1
    else "drias-explore2-radis"
)

ETL_LIMIT = os.environ.get("ETL_LIMIT", "").strip()
SKIP_EXISTING = os.environ.get("DRIAS_SKIP_EXISTING", "1") != "0"
FORCE = os.environ.get("DRIAS_FORCE", "0") == "1"


def _parse_horizons() -> list[str]:
    raw = os.environ.get("ETL_HORIZON", "2050").strip().lower()
    if raw in ("all", "both", "2030,2050"):
        return ["2030", "2050"]
    if raw in HORIZON_PERIODS:
        return [raw]
    print(f"ETL_HORIZON invalide: {raw!r} (2030|2050|all)", file=sys.stderr)
    raise SystemExit(2)


def _default_checkpoint(horizon: str) -> Path:
    """Chemin checkpoint par horizon (fichiers séparés 2030 / 2050)."""
    env = os.environ.get("DRIAS_CHECKPOINT", "").strip()
    if env:
        # Support template explicite : …/drias-checkpoint-{horizon}.jsonl
        if "{horizon}" in env:
            return Path(env.replace("{horizon}", horizon))
        path = Path(env)
        # Ancien chemin unique → suffixe -2030 / -2050
        name = path.name
        if horizon in name:
            return path
        if name.endswith(".jsonl"):
            return path.with_name(name[:-6] + f"-{horizon}.jsonl")
        return path.with_name(f"{name}-{horizon}")
    file_path = Path(__file__).resolve()
    try:
        repo_root = file_path.parents[3]
        if (repo_root / "package.json").exists():
            return repo_root / "data" / f"drias-checkpoint-{horizon}.jsonl"
    except IndexError:
        pass
    return Path(f"/data/drias-checkpoint-{horizon}.jsonl")


WEIGHTS = {
    "heat": 0.18,
    "flood": 0.18,
    "coastal": 0.10,
    "drought": 0.12,
    "wildfire": 0.10,
    "clay": 0.11,
    "radon": 0.08,
    "seismic": 0.08,
    "cavity": 0.05,
}

COAST_POINTS = [
    (51.05, 2.35),
    (50.72, 1.6),
    (49.93, 1.08),
    (49.49, 0.1),
    (48.65, -2.0),
    (48.39, -4.49),
    (47.75, -3.37),
    (47.27, -2.2),
    (46.16, -1.15),
    (44.66, -1.17),
    (43.49, -1.56),
    (42.7, 3.03),
    (43.12, 3.1),
    (43.3, 5.37),
    (43.12, 5.93),
    (43.55, 7.02),
]


@dataclass
class Commune:
    insee: str
    name: str
    lat: float
    lon: float


@dataclass
class RawIndicators:
    insee: str
    name: str
    lat: float
    lon: float
    heat_days_30: float
    heavy_rain_days: float
    dry_days: float
    max_dry_spell: float
    coast_distance_km: float
    models_ok: int
    source: str
    # Hydro-climat (proxy DRIAS-Eau via bilan ETP−P + pluies extrêmes)
    water_deficit_mm: float = -1.0
    extreme_rain_days: float = -1.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def coast_distance_km(lat: float, lon: float) -> float:
    return min(haversine_km(lat, lon, clat, clon) for clat, clon in COAST_POINTS)


def normalize_risk(values: list[float]) -> list[int]:
    vmin, vmax = min(values), max(values)
    if vmax == vmin:
        return [50 for _ in values]
    return [int(round(100 * ((v - vmin) / (vmax - vmin)))) for v in values]


def max_consecutive(flags: np.ndarray) -> int:
    best = cur = 0
    for flag in flags:
        if flag:
            cur += 1
            best = max(best, cur)
        else:
            cur = 0
    return best


def flatten_daily(arr: np.ndarray) -> np.ndarray:
    if arr.ndim == 3:
        return np.nanmean(arr, axis=(1, 2))
    if arr.ndim == 2:
        return np.nanmean(arr, axis=1)
    return arr


def fetch_drias_daily(
    lat: float,
    lon: float,
    transformer: Transformer,
    gcm: str,
    rcm: str,
    date_start: str,
    date_end: str,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    x, y = transformer.transform(lon, lat)
    params = [
        ("GCM", gcm),
        ("RCM", rcm),
        ("BC", BC),
        ("RCP", RCP),
        ("ETP", "FAO"),
        ("fields", "tasmax"),
        ("fields", "prtot"),
        ("fields", "evspsblpot"),
        ("LAMBX__greater", str(int(x) - PAD_M)),
        ("LAMBX__less", str(int(x) + PAD_M)),
        ("LAMBY__greater", str(int(y) - PAD_M)),
        ("LAMBY__less", str(int(y) + PAD_M)),
        ("DATE__greater", date_start),
        ("DATE__less", date_end),
    ]

    last_error: Exception | None = None
    for attempt in range(5):
        try:
            response = requests.get(DRIAS_BASE, params=params, timeout=180)
            if response.status_code in (429, 500, 502, 503):
                time.sleep(1.5 * (2**attempt))
                last_error = RuntimeError(f"HTTP {response.status_code}")
                continue
            response.raise_for_status()
            if len(response.content) < 100 or response.content[:3] == b'{"e':
                raise RuntimeError(response.text[:200])

            with tempfile.NamedTemporaryFile(suffix=".nc", delete=False) as tmp:
                tmp.write(response.content)
                path = tmp.name
            try:
                ds = Dataset(path)
                tas = flatten_daily(np.array(ds.variables["tasmax"][:]))
                pr = flatten_daily(np.array(ds.variables["prtot"][:]))
                etp = flatten_daily(np.array(ds.variables["evspsblpot"][:]))
                ds.close()
                return tas, pr, etp
            finally:
                os.unlink(path)
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(1.5 * (2**attempt))

    raise RuntimeError(f"DRIAS fetch failed ({gcm}/{rcm}): {last_error}")


def compute_raw_arrays(
    lat: float,
    lon: float,
    tas: np.ndarray,
    pr: np.ndarray,
    etp: np.ndarray,
) -> dict[str, float]:
    years = max(len(tas) / 365.25, 1.0)
    dry_flags = pr < 0.1
    # Déficit hydrique climatique (mm/an) — proxy DRIAS-Eau / Explore2
    deficit = np.nansum(np.maximum(etp - pr, 0.0)) / years
    return {
        "heat_days_30": float(np.nansum(tas >= 30) / years),
        "heavy_rain_days": float(np.nansum(pr >= 20) / years),
        "extreme_rain_days": float(np.nansum(pr >= 40) / years),
        "dry_days": float(np.nansum(dry_flags) / years),
        "max_dry_spell": float(max_consecutive(dry_flags) / years),
        "water_deficit_mm": float(deficit),
        "coast_distance_km": coast_distance_km(lat, lon),
    }


def average_parts(parts: list[dict[str, float]]) -> dict[str, float]:
    n = len(parts)
    keys = [
        "heat_days_30",
        "heavy_rain_days",
        "extreme_rain_days",
        "dry_days",
        "max_dry_spell",
        "water_deficit_mm",
        "coast_distance_km",
    ]
    return {k: sum(p[k] for p in parts) / n for k in keys}


def fetch_ensemble_raw(
    lat: float,
    lon: float,
    transformer: Transformer,
    date_start: str,
    date_end: str,
) -> tuple[dict[str, float], int]:
    parts: list[dict[str, float]] = []
    errors: list[str] = []

    def one(chain: tuple[str, str]) -> dict[str, float]:
        gcm, rcm = chain
        tas, pr, etp = fetch_drias_daily(
            lat, lon, transformer, gcm, rcm, date_start, date_end
        )
        return compute_raw_arrays(lat, lon, tas, pr, etp)

    with ThreadPoolExecutor(max_workers=min(3, len(CHAINS))) as pool:
        futures = {pool.submit(one, chain): chain for chain in CHAINS}
        for future in as_completed(futures):
            chain = futures[future]
            try:
                parts.append(future.result())
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{chain[0]}/{chain[1]}: {exc}")

    if not parts:
        raise RuntimeError("; ".join(errors) or "aucune chaîne DRIAS")

    return average_parts(parts), len(parts)


def load_checkpoint(path: Path) -> dict[str, RawIndicators]:
    if not path.exists():
        return {}
    out: dict[str, RawIndicators] = {}
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            src = row.get("source", "")
            if src not in (SOURCE, SOURCE_LEGACY) and not str(src).startswith(
                "drias-explore2"
            ):
                continue
            row.setdefault("water_deficit_mm", -1.0)
            row.setdefault("extreme_rain_days", -1.0)
            # Ne garder que les champs du dataclass
            allowed = {f.name for f in RawIndicators.__dataclass_fields__.values()}  # type: ignore[attr-defined]
            cleaned = {k: v for k, v in row.items() if k in allowed}
            out[cleaned["insee"]] = RawIndicators(**cleaned)
    return out


def append_checkpoint(path: Path, raw: RawIndicators) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(asdict(raw), ensure_ascii=False) + "\n")


def rewrite_checkpoint(path: Path, rows: dict[str, RawIndicators]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as handle:
        for raw in sorted(rows.values(), key=lambda r: r.name):
            handle.write(json.dumps(asdict(raw), ensure_ascii=False) + "\n")
    tmp.replace(path)


def score_hazards(raws: list[RawIndicators]) -> list[dict[str, int]]:
    heat = normalize_risk([r.heat_days_30 for r in raws])
    # Inondation : pluies intenses + extrêmes (proxy hydrologique Explore2)
    flood = normalize_risk(
        [
            max(r.heavy_rain_days, 0) * 0.55 + max(r.extreme_rain_days, 0) * 0.45
            for r in raws
        ]
    )
    # Sécheresse : bilan hydrique ETP−P (proxy DRIAS-Eau) + jours secs
    drought = normalize_risk(
        [
            max(r.water_deficit_mm, 0) * 0.5
            + max(r.dry_days, 0) * 0.3
            + max(r.max_dry_spell, 0) * 0.2
            for r in raws
        ]
    )
    # Feux : surtout sécheresse pluviométrique, peu de chaleur (évite double-compte)
    wildfire = normalize_risk(
        [
            max(r.dry_days, 0) * 0.5
            + max(r.max_dry_spell, 0) * 0.3
            + max(r.heat_days_30, 0) * 0.2
            for r in raws
        ]
    )
    coastal_risk = [max(0.0, 120 - r.coast_distance_km) / 120 for r in raws]
    coastal = normalize_risk(coastal_risk)
    # Argiles / radon / séisme / cavités : pas de proxy DRIAS — remplis par le blend Géorisques
    clay = [0 for _ in raws]
    radon = [0 for _ in raws]
    seismic = [0 for _ in raws]
    cavity = [0 for _ in raws]

    return [
        {
            "heat": heat[i],
            "flood": flood[i],
            "drought": drought[i],
            "wildfire": wildfire[i],
            "coastal": coastal[i],
            "clay": clay[i],
            "radon": radon[i],
            "seismic": seismic[i],
            "cavity": cavity[i],
        }
        for i in range(len(raws))
    ]


def compute_score(hazards: dict[str, int]) -> int:
    total = sum(hazards[k] * WEIGHTS[k] for k in WEIGHTS)
    return int(round(total))


def run_horizon(horizon: str, database_url: str, etl_limit: int | None) -> int:
    date_start, date_end = HORIZON_PERIODS[horizon]
    checkpoint_path = _default_checkpoint(horizon)

    print(
        f"\n=== Horizon {horizon} · {date_start}→{date_end} · "
        f"ensemble={len(CHAINS)} · {BC}/{RCP} · source={SOURCE} ==="
    )
    for gcm, rcm in CHAINS:
        print(f"  • {gcm} / {rcm}")
    print(f"Checkpoint: {checkpoint_path}")
    if etl_limit is not None:
        print(f"ETL_LIMIT={etl_limit} (plafond de nouveaux fetchs)")

    transformer = Transformer.from_crs("EPSG:4326", "EPSG:27572", always_xy=True)
    checkpoint = {} if FORCE else load_checkpoint(checkpoint_path)
    print(f"Checkpoint chargé: {len(checkpoint)} communes ({SOURCE})")

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.insee, c.name, g.lat, g.lon
                FROM communes c
                INNER JOIN commune_geo g ON g.insee = c.insee
                WHERE g.lat IS NOT NULL AND g.lon IS NOT NULL
                ORDER BY c.name
                """
            )
            communes = [
                Commune(insee=r[0], name=r[1], lat=float(r[2]), lon=float(r[3]))
                for r in cur.fetchall()
            ]

        if not communes:
            print("Aucune commune en base. Lance npm run import:communes", file=sys.stderr)
            return 1

        fetched = 0
        for commune in communes:
            existing = checkpoint.get(commune.insee)
            # Skip seulement si hydro déjà présent (water_deficit_mm >= 0)
            if (
                SKIP_EXISTING
                and not FORCE
                and existing is not None
                and existing.water_deficit_mm >= 0
            ):
                continue
            if etl_limit is not None and fetched >= etl_limit:
                print(f"ETL_LIMIT atteint ({etl_limit}) — arrêt des fetchs.")
                break

            print(f"→ {commune.name} ({commune.insee})… ", end="", flush=True)
            try:
                stats, models_ok = fetch_ensemble_raw(
                    commune.lat, commune.lon, transformer, date_start, date_end
                )
                raw = RawIndicators(
                    insee=commune.insee,
                    name=commune.name,
                    lat=commune.lat,
                    lon=commune.lon,
                    heat_days_30=stats["heat_days_30"],
                    heavy_rain_days=stats["heavy_rain_days"],
                    extreme_rain_days=stats["extreme_rain_days"],
                    dry_days=stats["dry_days"],
                    max_dry_spell=stats["max_dry_spell"],
                    water_deficit_mm=stats["water_deficit_mm"],
                    coast_distance_km=stats["coast_distance_km"],
                    models_ok=models_ok,
                    source=SOURCE,
                )
                checkpoint[commune.insee] = raw
                append_checkpoint(checkpoint_path, raw)
                fetched += 1
                print(
                    f"models={raw.models_ok}/{len(CHAINS)} "
                    f"heat30={raw.heat_days_30:.1f}/an rain20={raw.heavy_rain_days:.1f}/an "
                    f"rain40={raw.extreme_rain_days:.1f}/an deficit={raw.water_deficit_mm:.0f}mm "
                    f"dry={raw.dry_days:.1f}/an"
                )
            except Exception as exc:  # noqa: BLE001
                print("SKIP")
                print(f"  {exc}", file=sys.stderr)
            time.sleep(0.25)

        to_score = [checkpoint[c.insee] for c in communes if c.insee in checkpoint]
        if not to_score:
            print(
                f"Aucun indicateur DRIAS pour {horizon} (checkpoint vide).",
                file=sys.stderr,
            )
            return 1

        print(f"Normalisation relative sur {len(to_score)} communes…")
        hazards_list = score_hazards(to_score)

        with conn.cursor() as cur:
            for raw, hazards in zip(to_score, hazards_list, strict=True):
                score = compute_score(hazards)
                cur.execute(
                    """
                    INSERT INTO commune_scores (
                      insee, horizon, heat, flood, coastal, drought, wildfire, clay, radon, seismic, cavity, score, source, updated_at
                    ) VALUES (
                      %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW()
                    )
                    ON CONFLICT (insee, horizon) DO UPDATE SET
                      heat = EXCLUDED.heat,
                      flood = EXCLUDED.flood,
                      coastal = EXCLUDED.coastal,
                      drought = EXCLUDED.drought,
                      wildfire = EXCLUDED.wildfire,
                      clay = EXCLUDED.clay,
                      radon = EXCLUDED.radon,
                      seismic = EXCLUDED.seismic,
                      cavity = EXCLUDED.cavity,
                      score = EXCLUDED.score,
                      source = EXCLUDED.source,
                      updated_at = NOW()
                    """,
                    (
                        raw.insee,
                        horizon,
                        hazards["heat"],
                        hazards["flood"],
                        hazards["coastal"],
                        hazards["drought"],
                        hazards["wildfire"],
                        hazards["clay"],
                        hazards["radon"],
                        hazards["seismic"],
                        hazards["cavity"],
                        score,
                        SOURCE,
                    ),
                )
                print(f"✓ {raw.name}: score={score} ({horizon})")
        conn.commit()

    rewrite_checkpoint(checkpoint_path, checkpoint)
    print(
        f"Horizon {horizon} terminé: {len(to_score)} scorées · "
        f"{fetched} nouvelles · checkpoint={checkpoint_path}"
    )
    return 0


def main() -> int:
    database_url = os.environ.get(
        "DATABASE_URL",
        "postgresql://wheretosurvive:wheretosurvive@localhost:5432/wheretosurvive",
    )

    etl_limit: int | None = None
    if ETL_LIMIT:
        etl_limit = int(ETL_LIMIT)
        if etl_limit <= 0:
            etl_limit = None

    horizons = _parse_horizons()
    print(
        f"ETL DRIAS via RADIS — horizons={','.join(horizons)}"
    )
    print("Citez : DRIAS / Explore2 / Météo-France & partenaires ; API RADIS (INRAE G-EAU).")

    exit_code = 0
    for horizon in horizons:
        code = run_horizon(horizon, database_url, etl_limit)
        if code != 0:
            exit_code = code
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
