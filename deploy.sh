#!/usr/bin/env bash
# Déploiement Où Vivre Demain (Docker) + options de chargement de données.
#
# Exemples :
#   ./deploy.sh                         # menu interactif
#   ./deploy.sh --menu                  # idem
#   ./deploy.sh --update                # git pull + build + up + migrate
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
DO_ETL_REGULATORY=0
DO_GIT_PULL=0
ETL_LIMIT_VAL=""
ETL_HORIZON_VAL="${ETL_HORIZON:-2050}"
ENSEMBLE=1
SKIP_EXISTING=1
FORCE=0
COMMUNE_LIMIT_VAL="${COMMUNE_LIMIT:-100}"
LIMIT_EXPLICIT=0
ETL_LIMIT_EXPLICIT=0
ETL_HORIZON_EXPLICIT=0
SHOW_MENU=0

usage() {
  cat <<'EOF'
Usage: ./deploy.sh [options]
       ./deploy.sh              # menu interactif
       ./deploy.sh --menu       # idem

Stack Docker
  --build              Build les images
  --up                 Démarre db + redis + api + web
  --down               Arrête la stack (conserve Postgres/Redis/ETL sur disque)
  --migrate            Applique les migrations SQL (via conteneur api)
  --seed               Seed stubs (démo uniquement — pas pour prod)
  --git-pull           git pull avant le reste (mises à jour)

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
  --etl-regulatory     Ancrage réglementaire (Géorisques, etc.)
  --etl-horizon H      2030 | 2050 | all (défaut: 2050)
  --etl-limit N        Max de nouvelles communes à fetcher côté DRIAS
  --skip-existing      Reprend le checkpoint (défaut)
  --force              Refetch DRIAS même si déjà dans le checkpoint
  --no-skip-existing   Alias inverse de --skip-existing désactivé

Raccourcis
  --update             git pull + build api/web + up + migrate (sans import / ETL)
  --prod-data          --import-all --etl-drias --etl-horizon all (très long)
  --preprod-data       --import-sample --limit 1000 --etl-drias --etl-horizon all --etl-limit 1000
  --dev-data           --import-sample --etl-drias --etl-horizon all --etl-limit 100
  --menu               Affiche le menu interactif

  -h, --help           Aide

Variables d’env utiles : DATABASE_URL, COMMUNE_LIMIT, DRIAS_ENSEMBLE, ETL_LIMIT, ETL_HORIZON
EOF
}

apply_recipe() {
  case "$1" in
    update|update-no-pull)
      # Site uniquement : jamais d’import communes / ETL / seed
      DO_IMPORT=0
      DO_ETL_DRIAS=0
      DO_ETL_CLIMATE=0
      DO_ETL_REGULATORY=0
      DO_SEED=0
      DO_BUILD=1
      DO_UP=1
      DO_MIGRATE=1
      if [[ "$1" == "update" ]]; then
        DO_GIT_PULL=1
      else
        DO_GIT_PULL=0
      fi
      ;;
    start)
      DO_UP=1
      ;;
    stop)
      DO_DOWN=1
      ;;
    first)
      DO_BUILD=1
      DO_UP=1
      DO_MIGRATE=1
      DO_IMPORT=0
      DO_ETL_DRIAS=0
      DO_ETL_CLIMATE=0
      DO_ETL_REGULATORY=0
      DO_SEED=0
      ;;
    restart)
      DO_DOWN=1
      DO_UP=1
      ;;
    dev-data)
      DO_UP=1
      DO_MIGRATE=1
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
    preprod-data)
      DO_UP=1
      DO_MIGRATE=1
      DO_IMPORT=1
      IMPORT_MODE="sample"
      DO_ETL_DRIAS=1
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
    prod-data)
      DO_UP=1
      DO_MIGRATE=1
      DO_IMPORT=1
      IMPORT_MODE="all"
      DO_ETL_DRIAS=1
      ETL_HORIZON_VAL="all"
      ;;
    etl-resume)
      DO_ETL_DRIAS=1
      ETL_HORIZON_VAL="all"
      SKIP_EXISTING=1
      ;;
    regulatory)
      DO_ETL_REGULATORY=1
      ;;
    *)
      echo "Recette inconnue: $1" >&2
      return 1
      ;;
  esac
}

show_menu() {
  if [[ ! -t 0 ]]; then
    echo "Pas de TTY — utilisez des options (ex. ./deploy.sh --update) ou --help." >&2
    usage >&2
    exit 1
  fi

  cat <<'EOF'

  Où Vivre Demain — déploiement
  ─────────────────────────────
  Site / stack  (ne touche PAS aux données métier)
    1) Mettre à jour le site          git pull + build api/web + up + migrate
    2) Mettre à jour (sans git pull)  build api/web + up + migrate
    3) Démarrer la stack              --up
    4) Arrêter la stack               --down (données conservées)
    5) Redémarrer                     --down puis --up
    6) Premier déploiement            --build --up --migrate (sans import)

  Données  (import / ETL — long)
    7) Échantillon (~100 communes)    --dev-data
    8) Préprod (~1000 communes)       --preprod-data
    9) Prod nationale (très long)     --prod-data
   10) Reprendre ETL DRIAS            --etl-drias --etl-horizon all
   11) Ancrage réglementaire          etl:regulatory

  Infos
   12) Statut des conteneurs
   13) Logs (web + api)
    0) Quitter
    h) Aide détaillée

EOF
  printf "Choix [1] : "
  read -r choice
  choice="${choice:-1}"

  case "$choice" in
    1) apply_recipe update ;;
    2) apply_recipe update-no-pull ;;
    3) apply_recipe start ;;
    4) apply_recipe stop ;;
    5) apply_recipe restart ;;
    6) apply_recipe first ;;
    7) apply_recipe dev-data ;;
    8) apply_recipe preprod-data ;;
    9)
      echo
      echo "⚠  Import national + ETL DRIAS : peut prendre des heures / jours."
      printf "Confirmer ? [o/N] : "
      read -r confirm
      case "$confirm" in
        o|O|y|Y|oui|Oui) apply_recipe prod-data ;;
        *)
          echo "Annulé."
          exit 0
          ;;
      esac
      ;;
    10) apply_recipe etl-resume ;;
    11) apply_recipe regulatory ;;
    12)
      # shellcheck disable=SC1091
      if [[ -f .env ]]; then set -a; source .env; set +a; fi
      docker compose ps
      exit 0
      ;;
    13)
      # shellcheck disable=SC1091
      if [[ -f .env ]]; then set -a; source .env; set +a; fi
      docker compose logs -f --tail=80 web api
      exit 0
      ;;
    0|q|Q)
      echo "Annulé."
      exit 0
      ;;
    h|H|-h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Choix invalide: $choice" >&2
      exit 1
      ;;
  esac
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --menu) SHOW_MENU=1 ;;
    --build) DO_BUILD=1 ;;
    --up) DO_UP=1 ;;
    --down) DO_DOWN=1 ;;
    --migrate) DO_MIGRATE=1 ;;
    --seed) DO_SEED=1 ;;
    --git-pull) DO_GIT_PULL=1 ;;
    --update)
      apply_recipe update
      ;;
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
    --etl-regulatory) DO_ETL_REGULATORY=1 ;;
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

if [[ "$SHOW_MENU" -eq 1 ]] || [[ "$DO_DOWN$DO_BUILD$DO_UP$DO_MIGRATE$DO_SEED$DO_IMPORT$DO_ETL_DRIAS$DO_ETL_CLIMATE$DO_ETL_REGULATORY$DO_GIT_PULL" == "0000000000" ]]; then
  show_menu
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

if [[ "$DO_GIT_PULL" -eq 1 ]]; then
  echo "==> git pull"
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git pull --ff-only
  else
    echo "Pas un dépôt git — skip git pull" >&2
  fi
fi

# Garde-fou : une mise à jour site ne doit jamais importer / ETL
if [[ "$DO_BUILD" -eq 1 || "$DO_UP" -eq 1 || "$DO_MIGRATE" -eq 1 ]] \
  && [[ "$DO_IMPORT$DO_ETL_DRIAS$DO_ETL_CLIMATE$DO_ETL_REGULATORY$DO_SEED" == "00000" ]]; then
  echo "==> Mise à jour applicative uniquement (aucun import communes / ETL)"
fi

if [[ "$DO_DOWN" -eq 1 ]]; then
  echo "==> docker compose down (les données sur disque dans @data / DATA_ROOT sont conservées)"
  compose down
fi

if [[ "$DO_BUILD" -eq 1 ]]; then
  echo "==> Build images"
  ensure_data_dirs
  if [[ "$DO_ETL_DRIAS" -eq 1 || "$DO_ETL_CLIMATE" -eq 1 ]]; then
    compose --profile etl build
  else
    # Mise à jour site : pas besoin de rebuild l’image ETL
    compose build api web
  fi
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

if [[ "$DO_ETL_REGULATORY" -eq 1 ]]; then
  echo "==> Ancrage réglementaire (Géorisques)"
  ensure_db
  ensure_api
  api_exec npm run etl:regulatory
fi

echo "==> Terminé."
echo "    Site : http://localhost:${WEB_PORT:-4321}"
echo "    API  : http://localhost:${API_PORT:-3000}/health"
echo "    DB   : $POSTGRES_DATA_DIR"
