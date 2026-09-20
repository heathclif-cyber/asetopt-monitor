# GIS API/worker image. Pin the base digest in deployment after its first verified build.
FROM mcr.microsoft.com/playwright/python:v1.49.1-jammy

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gdal-bin libgdal-dev \
  && rm -rf /var/lib/apt/lists/*

COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api/ .
COPY supabase/migrations /supabase/migrations

ENV UPLOAD_DIR=/app/uploads \
    GIS_UPLOAD_ROOT=/app/gis-data \
    MIGRATIONS_DIR=/supabase/migrations \
    GIS_ENABLED=true

RUN mkdir -p /app/uploads /app/gis-data/originals /app/gis-data/staging

EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
