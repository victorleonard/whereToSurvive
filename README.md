# Où Vivre Demain

Comparer les communes de France face au climat (horizons 2030 et 2050).

Stack : **Astro** (front) · **Hono** (API) · **Postgres/PostGIS** · **Redis** · **Docker Compose**

> Identifiants techniques (packages npm, volumes `@data/wheretosurvive/`) conservés pour ne pas casser le déploiement.

## Dev local (échantillon)

En développement on **ne charge pas** toute la France : défaut `COMMUNE_LIMIT=100`.

```bash
cp .env.example .env
npm install
docker compose up -d db redis
npm run db:setup
COMMUNE_LIMIT=100 npm run import:communes
ETL_LIMIT=100 npm run etl:drias              # horizon 2050
ETL_HORIZON=2030 ETL_LIMIT=100 npm run etl:drias
# ou les deux d’un coup :
ETL_HORIZON=all ETL_LIMIT=100 npm run etl:drias
npm run dev:api   # :3000
npm run dev:web   # :4321
```

Sans Postgres, l’API bascule sur les stubs en mémoire.

### ETL climat

```bash
# DRIAS ensemble (3 modèles) — reprise via checkpoint ; défaut horizon 2050
ETL_LIMIT=40 npm run etl:drias
ETL_HORIZON=2030 ETL_LIMIT=40 npm run etl:drias
ETL_HORIZON=all ETL_LIMIT=40 npm run etl:drias:all

# Une seule chaîne (plus rapide)
DRIAS_ENSEMBLE=0 ETL_LIMIT=40 npm run etl:drias

# Fallback Open-Meteo
npm run etl:climate
```

### ETL réglementaire (Géorisques + CEREMA)

Après les scores DRIAS, ancrage réglementaire (TRI / AZI / PPRN, RGA, OLD, INEC) :

```bash
npm run etl:regulatory
```

Re-blend forcé (après un `etl:drias` qui a réécrit des scores « purs ») : `FORCE_GEO=1 npm run etl:regulatory`.

### BDIFF (optionnel)

Historique des feux de forêt — **pas d’API publique**. Le portail [bdiff.agriculture.gouv.fr](https://bdiff.agriculture.gouv.fr/) est parfois inaccessible ; [data.gouv.fr](https://www.data.gouv.fr/datasets/base-de-donnees-sur-les-incendies-de-forets-en-france-bdiff) ne fait que pointer vers ce portail (pas de CSV miroir).

Sans BDIFF, l’aléa feux s’appuie déjà sur DRIAS + Géorisques (OLD / GASPAR).

Quand un export CSV est disponible :

```bash
# Placer l’export dans data/bdiff.csv (voir data/bdiff.csv.example)
npm run etl:bdiff
npm run etl:regulatory
```

Ou `BDIFF_CSV=/chemin/vers/export.csv npm run etl:bdiff`.

## Prod VPS — persistance `/projets/@data`

Guide détaillé : **[docs/mise-en-prod.md](docs/mise-en-prod.md)**.

`/projets/@data` est **partagé** (ex. `ludolist/`, `mysql/`). WhereToSurvive n’écrit **que** dans son sous-dossier :

```
/projets/
  @data/
    ludolist/              ← autres projets — ne pas toucher
    mysql/
    wheretosurvive/        ← ce projet uniquement
      postgres/            ← PostGIS
      redis/
      etl/                 ← checkpoints DRIAS
  whereToSurvive/
```

Dans `.env` sur le VPS :

```bash
DATA_ROOT=/projets/@data
```

(`deploy.sh` résout en `$DATA_ROOT/wheretosurvive/…` — jamais à la racine de `@data`.)

Puis :

```bash
./deploy.sh --build --up --migrate
# ou chargement national
./deploy.sh --up --migrate --prod-data
```

`docker compose down` **ne supprime pas** ces dossiers (bind mounts, pas de volume Docker nommé).

## Prod / Docker — `deploy.sh`

```bash
./deploy.sh --help

# Stack seule
./deploy.sh --build --up --migrate

# Données type « dev » (échantillon)
./deploy.sh --up --migrate --dev-data

# Données nationales (très long : import ~35k + DRIAS)
./deploy.sh --up --migrate --prod-data

# Reprise ETL après interruption
./deploy.sh --etl-drias --skip-existing --etl-limit 500
```

Options utiles : `--import-sample`, `--import-all`, `--limit N`, `--etl-drias`, `--etl-drias-fast`, `--etl-climate`, `--force`.

En local, défaut `DATA_ROOT=./.data` (gitignoré).

## Structure

```
apps/
  api/           # Hono + Drizzle + ETL Python DRIAS
  web/           # Astro SSR
deploy.sh        # déploiement + chargement données
docs/
```

## API

| Route | Description |
|-------|-------------|
| `GET /health` | Santé + statut DB / Redis |
| `GET /methodology` | Méthodo score + pondérations |
| `GET /scores?limit=20` | Classement (`w_heat`, `w_flood`…) |
| `GET /communes/search?q=` | Recherche |
| `GET /communes/:insee` | Fiche commune |
| `GET /communes/:insee/georisques` | Proxy Géorisques (cache 24h) |
| `GET /compare?insee=a,b` | Comparaison (2–4) |

UI comparaison : `/comparer`
