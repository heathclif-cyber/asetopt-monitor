FROM mcr.microsoft.com/playwright/python:v1.49.1-jammy

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV UPLOAD_DIR=/app/uploads
ENV SUPERMAN_STATE_PATH=/app/.superman_state.json
ENV SUPERMAN_HEADLESS=true

RUN mkdir -p /app/uploads

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]