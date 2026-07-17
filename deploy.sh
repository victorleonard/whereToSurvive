#!/usr/bin/env bash
# Déploiement Où Vivre Demain (Docker) + options de chargement de données.
#
# Exemples :
#   ./deploy.sh --up
#   ./deploy.sh --up --migrate
#   ./deploy.sh --up --migrate --import-sample --etl-drias   # proche du flux local
#   ./deploy.sh --up --migrate --import-all --etl-drias      # prod nationale (long)
#   ./deploy.sh --etl-drias --etl-limit 200 --skip-existing
#   ./deploy.sh --help

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

DO_BUILD=0
DO_UP=0
DO_DOWN=0
DO_MIGRATE=0
DO_SEED=0
DO_IMPORT=0
IMPORT_MODE="sample" # sample | all
DO_ETL_DRIAS=0
DO_ETL_CLIMATE=0
ETL_LIMIT_VAL=""
ETL_HORIZON_VAL="${ETL_HORIZON:-2050}"
ENSEMBLE=1
SKIP_EXISTING=1
FORCE=0
COMMUNE_LIMIT_VAL="${COMMUNE_LIMIT:-100}"
LIMIT_EXPLICIT=0
ETL_LIMIT_EXPLICIT=0
ETL_HORIZON_EXPLICIT=0

usage() {
  cat <<'EOF'
Usage: ./deploy.sh [options]

Stack Docker
  --build              Build les images
  --up                 Démarre db + redis + api + web
  --down               Arrête la stack (conserve Postgres/Redis/ETL sur disque)
  --migrate            Applique les migrations SQL (via conteneur api)
  --seed               Seed stubs (démo uniquement — pas pour prod)

Persistance VPS
  DATA_ROOT=/projets/@data  → uniquement @data/wheretosurvive/{postgres,redis,etl}
  (ne touche pas aux autres dossiers de @data : ludolist, mysql, …)

Données
  --import-sample      Import top N communes (défaut N=100, override COMMUNE_LIMIT / --limit)
  --import-all         Import toutes les communes métropole (~35k)
  --limit N            Limite d’import / d’ETL (échantillon)
  --etl-drias          Lance l’ETL DRIAS (ensemble 3 modèles, checkpoint/reprise)
  --etl-drias-fast     Idem avec 1 seul modèle (plus rapide)
  --etl-climate        ETL Open-Meteo CMIP6 (fallback)
  --etl-horizon H      2030 | 2050 | all (défaut: 2050)
  --etl-limit N        Max de nouvelles communes à fetcher côté DRIAS
  --skip-existing      Reprend le checkpoint (défaut)
  --force              Refetch DRIAS même si déjà dans le checkpoint
  --no-skip-existing   Alias inverse de --skip-existing désactivé

Raccourcis
  --prod-data          --import-all --etl-drias --etl-horizon all (très long)
  --preprod-data       --import-sample --limit 1000 --etl-drias --etl-horizon all --etl-limit 1000
  --dev-data           --import-sample --etl-drias --etl-horizon all --etl-limit 100

  -h, --help           Aide

Variables d’env utiles : DATABASE_URL, COMMUNE_LIMIT, DRIAS_ENSEMBLE, ETL_LIMIT, ETL_HORIZON
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build) DO_BUILD=1 ;;
    --up) DO_UP=1 ;;
    --down) DO_DOWN=1 ;;
    --migrate) DO_MIGRATE=1 ;;
    --seed) DO_SEED=1 ;;
    --import-sample)
      DO_IMPORT=1
      IMPORT_MODE="sample"
      ;;
    --import-all)
      DO_IMPORT=1
      IMPORT_MODE="all"
      ;;
    --limit)
      shift
      COMMUNE_LIMIT_VAL="$1"
      LIMIT_EXPLICIT=1
      ;;
    --etl-drias) DO_ETL_DRIAS=1 ;;
    --etl-drias-fast)
      DO_ETL_DRIAS=1
      ENSEMBLE=0
      ;;
    --etl-climate) DO_ETL_CLIMATE=1 ;;
    --etl-horizon)
      shift
      ETL_HORIZON_VAL="$1"
      ETL_HORIZON_EXPLICIT=1
      ;;
    --etl-limit)
      shift
      ETL_LIMIT_VAL="$1"
      ETL_LIMIT_EXPLICIT=1
      ;;
    --skip-existing) SKIP_EXISTING=1 ;;
    --no-skip-existing) SKIP_EXISTING=0 ;;
    --force) FORCE=1 ;;
    --prod-data)
      DO_IMPORT=1
      IMPORT_MODE="all"
      DO_ETL_DRIAS=1
      ETL_HORIZON_VAL="all"
      ;;
    --preprod-data)
      DO_IMPORT=1
      IMPORT_MODE="sample"
      DO_ETL_DRIAS=1
      # Force 1000 même si COMMUNE_LIMIT=100 dans .env (sauf --limit / --etl-limit)
      if [[ "$LIMIT_EXPLICIT" -eq 0 ]]; then
        COMMUNE_LIMIT_VAL=1000
      fi
      if [[ "$ETL_LIMIT_EXPLICIT" -eq 0 ]]; then
        ETL_LIMIT_VAL=1000
      fi
      if [[ "$ETL_HORIZON_EXPLICIT" -eq 0 ]]; then
        ETL_HORIZON_VAL="all"
      fi
      ;;
    --dev-data)
      DO_IMPORT=1
      IMPORT_MODE="sample"
      DO_ETL_DRIAS=1
      if [[ "$ETL_LIMIT_EXPLICIT" -eq 0 ]]; then
        ETL_LIMIT_VAL=100
      fi
      if [[ "$ETL_HORIZON_EXPLICIT" -eq 0 ]]; then
        ETL_HORIZON_VAL="all"
      fi
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Option inconnue: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [[ "$DO_DOWN$DO_BUILD$DO_UP$DO_MIGRATE$DO_SEED$DO_IMPORT$DO_ETL_DRIAS$DO_ETL_CLIMATE" == "00000000" ]]; then
  usage
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "→ Création .env depuis .env.example"
  cp .env.example .env
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

# Chemins de persistance (bind mounts — hors cycle de vie Docker)
# VPS : DATA_ROOT=/projets/@data
DATA_ROOT="${DATA_ROOT:-./.data}"
if [[ "$DATA_ROOT" != /* ]]; then
  DATA_ROOT="$ROOT/${DATA_ROOT#./}"
fi
export POSTGRES_DATA_DIR="${POSTGRES_DATA_DIR:-$DATA_ROOT/wheretosurvive/postgres}"
export REDIS_DATA_DIR="${REDIS_DATA_DIR:-$DATA_ROOT/wheretosurvive/redis}"
export ETL_DATA_DIR="${ETL_DATA_DIR:-$DATA_ROOT/wheretosurvive/etl}"
if [[ "$POSTGRES_DATA_DIR" != /* ]]; then
  POSTGRES_DATA_DIR="$ROOT/${POSTGRES_DATA_DIR#./}"
  export POSTGRES_DATA_DIR
fi
if [[ "$REDIS_DATA_DIR" != /* ]]; then
  REDIS_DATA_DIR="$ROOT/${REDIS_DATA_DIR#./}"
  export REDIS_DATA_DIR
fi
if [[ "$ETL_DATA_DIR" != /* ]]; then
  ETL_DATA_DIR="$ROOT/${ETL_DATA_DIR#./}"
  export ETL_DATA_DIR
fi

ensure_data_dirs() {
  # Uniquement …/wheretosurvive/{postgres,redis,etl} — jamais la racine de @data
  # (autres projets : ludolist, mysql, …)
  mkdir -p "$POSTGRES_DATA_DIR" "$REDIS_DATA_DIR" "$ETL_DATA_DIR"
  echo "→ Données persistantes (sous-dossier wheretosurvive uniquement) :"
  echo "    Postgres : $POSTGRES_DATA_DIR"
  echo "    Redis    : $REDIS_DATA_DIR"
  echo "    ETL      : $ETL_DATA_DIR"
}

compose() {
  docker compose "$@"
}

ensure_db() {
  ensure_data_dirs
  compose up -d db redis
  echo "→ Attente Postgres…"
  for _ in $(seq 1 40); do
    if compose exec -T db pg_isready -U "${POSTGRES_USER:-wheretosurvive}" -d "${POSTGRES_DB:-wheretosurvive}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Postgres indisponible" >&2
  exit 1
}

ensure_api() {
  if ! compose ps --status running --services 2>/dev/null | grep -qx api; then
    echo "→ Démarrage api (requis pour migrate/import)"
    compose up -d --build api
  fi
  echo "→ Attente API…"
  for _ in $(seq 1 60); do
    if curl -sf "http://localhost:${API_PORT:-3000}/health" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  echo "API indisponible" >&2
  exit 1
}

api_exec() {
  compose exec -T api "$@"
}

if [[ "$DO_DOWN" -eq 1 ]]; then
  echo "==> docker compose down (les données sur disque dans @data / DATA_ROOT sont conservées)"
  compose down
fi

if [[ "$DO_BUILD" -eq 1 ]]; then
  echo "==> Build images"
  ensure_data_dirs
  compose --profile etl build
fi

if [[ "$DO_UP" -eq 1 ]]; then
  echo "==> Démarrage stack (db redis api web)"
  ensure_data_dirs
  compose up -d db redis
  compose up -d --build api web
  echo "→ Attente API…"
  for _ in $(seq 1 60); do
    if curl -sf "http://localhost:${API_PORT:-3000}/health" >/dev/null; then
      break
    fi
    sleep 2
  done
  curl -sf "http://localhost:${API_PORT:-3000}/health" | head -c 300 || true
  echo
fi

if [[ "$DO_MIGRATE" -eq 1 ]]; then
  echo "==> Migrations"
  ensure_db
  ensure_api
  if api_exec sh -c 'test -f dist/db/migrate.js'; then
    api_exec node dist/db/migrate.js
  else
    api_exec npx tsx src/db/migrate.ts
  fi
fi

if [[ "$DO_SEED" -eq 1 ]]; then
  echo "==> Seed stubs (démo — pas pour prod)"
  ensure_db
  ensure_api
  api_exec npx tsx src/db/seed.ts
fi

if [[ "$DO_IMPORT" -eq 1 ]]; then
  ensure_db
  ensure_api
  if [[ "$IMPORT_MODE" == "all" ]]; then
    echo "==> Import TOUTES les communes métropole"
    api_exec env COMMUNE_LIMIT=all npx tsx src/etl/importCommunes.ts
  else
    echo "==> Import échantillon (COMMUNE_LIMIT=${COMMUNE_LIMIT_VAL})"
    api_exec env "COMMUNE_LIMIT=${COMMUNE_LIMIT_VAL}" npx tsx src/etl/importCommunes.ts
  fi
fi

if [[ "$DO_ETL_CLIMATE" -eq 1 ]]; then
  echo "==> ETL Open-Meteo CMIP6"
  ensure_db
  ensure_api
  api_exec npx tsx src/etl/runClimateEtl.ts
fi

if [[ "$DO_ETL_DRIAS" -eq 1 ]]; then
  echo "==> ETL DRIAS (Docker profile etl)"
  ensure_db
  export DRIAS_ENSEMBLE="$ENSEMBLE"
  export DRIAS_SKIP_EXISTING="$SKIP_EXISTING"
  export DRIAS_FORCE="$FORCE"
  export ETL_HORIZON="$ETL_HORIZON_VAL"
  if [[ -n "$ETL_LIMIT_VAL" ]]; then
    export ETL_LIMIT="$ETL_LIMIT_VAL"
  else
    unset ETL_LIMIT || true
  fi
  compose --profile etl run --rm \
    -e "DRIAS_ENSEMBLE=${DRIAS_ENSEMBLE}" \
    -e "DRIAS_SKIP_EXISTING=${DRIAS_SKIP_EXISTING}" \
    -e "DRIAS_FORCE=${DRIAS_FORCE}" \
    -e "ETL_LIMIT=${ETL_LIMIT:-}" \
    -e "ETL_HORIZON=${ETL_HORIZON}" \
    etl
fi

echo "==> Terminé."
echo "    Site : http://localhost:${WEB_PORT:-4321}"
echo "    API  : http://localhost:${API_PORT:-3000}/health"
echo "    DB   : $POSTGRES_DATA_DIR"
