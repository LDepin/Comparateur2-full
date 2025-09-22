# backend/Dockerfile
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000 \
    UVICORN_WORKERS=2

WORKDIR /app

# Dépendances système minimales (ajuste si besoin : psycopg2, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Dépendances Python
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install -r /app/requirements.txt

# Code
COPY backend /app

# Healthcheck local au conteneur (Render lit les logs, mais c’est utile)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
 CMD curl -fsS http://127.0.0.1:${PORT}/health || exit 1

# Démarrage (respecte $PORT imposé par Render)
CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]