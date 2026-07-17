#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
VENV="${ROOT}/.venv-etl"
REQ="${ROOT}/apps/api/etl-python/requirements.txt"
SCRIPT="${ROOT}/apps/api/etl-python/run_drias_etl.py"

if [[ ! -x "${VENV}/bin/python" ]]; then
  python3 -m venv "${VENV}"
  "${VENV}/bin/pip" install -q -r "${REQ}"
fi

export DATABASE_URL="${DATABASE_URL:-postgresql://wheretosurvive:wheretosurvive@localhost:5432/wheretosurvive}"
# Dev : plafond implicite si non défini (évite 35k fetchs par accident)
if [[ -z "${ETL_LIMIT+x}" ]]; then
  export ETL_LIMIT=100
  echo "→ ETL_LIMIT=100 (défaut dev — ETL_LIMIT=0 pour illimité, ou ./deploy.sh --prod-data)"
elif [[ -z "${ETL_LIMIT}" || "${ETL_LIMIT}" == "0" || "${ETL_LIMIT}" == "all" ]]; then
  unset ETL_LIMIT
  echo "→ ETL_LIMIT illimité"
fi
mkdir -p "${ROOT}/data"
export ETL_HORIZON="${ETL_HORIZON:-2050}"
# Laisser Python choisir data/drias-checkpoint-{2030|2050}.jsonl
unset DRIAS_CHECKPOINT
echo "→ ETL_HORIZON=${ETL_HORIZON}"
exec "${VENV}/bin/python" "${SCRIPT}"

