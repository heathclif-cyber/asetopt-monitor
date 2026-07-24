# FastAPI + Playwright (Superman automation)
# Build context = repo root
FROM mcr.microsoft.com/playwright/python:v1.49.1-jammy

WORKDIR /app

COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api/ .
# Migration SQL dipakai oleh _migrate.py (self-host / docker compose)
COPY supabase/migrations /supabase/migrations

ENV UPLOAD_DIR=/app/uploads
ENV SUPERMAN_STATE_PATH=/app/data/.superman_state.json
ENV SUPERMAN_HEADLESS=true
ENV MIGRATIONS_DIR=/supabase/migrations

RUN mkdir -p /app/uploads /app/data

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
