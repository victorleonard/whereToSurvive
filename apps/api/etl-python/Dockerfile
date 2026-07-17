FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends libhdf5-dev libnetcdf-dev gcc g++ \
  && rm -rf /var/lib/apt/lists/*

COPY apps/api/etl-python/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY apps/api/etl-python /app/etl-python

ENV DRIAS_CHECKPOINT=/data/drias-checkpoint.jsonl
ENV PYTHONUNBUFFERED=1

VOLUME ["/data"]

CMD ["python", "/app/etl-python/run_drias_etl.py"]
