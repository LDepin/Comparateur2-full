#!/bin/bash
set -e

# On part du dossier courant (ton vrai backend)
echo "CWD: $(pwd)"

# 1) Si tu as un backend imbriqué (backend/app), on remonte proprement
if [ -d backend/app ]; then
  echo "Found nested backend/app → promoting to ./app"
  rm -rf app
  mv backend/app app
  # si un backend/db a été créé, on ne l'écrase pas : on le laisse en place si tu en as déjà un à la racine
  if [ -d backend/db ] && [ ! -d db ]; then
    mv backend/db db
  fi
  rm -rf backend
fi

# 2) S'assure des dossiers et __init__.py
mkdir -p app/{routers,core,models,utils}
touch app/__init__.py app/routers/__init__.py app/core/__init__.py app/models/__init__.py app/utils/__init__.py

# 3) Crée config/db SI ABSENTS (on ne réécrit pas si tu as déjà mis du contenu)
if [ ! -f app/core/config.py ]; then
  cat > app/core/config.py << 'PY'
from pydantic_settings import BaseSettings
from pydantic import Field

class Settings(BaseSettings):
    DATABASE_URL: str = Field("sqlite:///./local.db", description="Postgres/SQLite URL")
    AUTH_JWT_SECRET: str = Field("devsecret-change-me", description="Shared HMAC secret for JWT validation")
    AUTH_JWT_ALG: str = "HS256"

    class Config:
        env_file = ".env"

settings = Settings()
PY
fi

if [ ! -f app/core/db.py ]; then
  cat > app/core/db.py << 'PY'
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from .config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
PY
fi

# 4) Router ping minimal
cat > app/routers/ping.py << 'PY'
from fastapi import APIRouter
router = APIRouter()

@router.get("/ping")
def ping():
    return {"ok": True}
PY

# 5) main.py minimal qui branche /ping et /health
cat > app/main.py << 'PY'
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers.ping import router as ping_router

app = FastAPI(title="Comparateur Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ping_router)

@app.get("/health")
def health():
    return {"ok": True}
PY

echo "Structure fix done."
