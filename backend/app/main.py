# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.db import init_db

from .routers.ping import router as ping_router
from .routers.users import router as users_router
from .routers.profiles import router as profiles_router
from .routers.quote import router as quote_router

# nouveaux
from .routers.calendar import router as calendar_router
from .routers.search import router as search_router

app = FastAPI(title="Comparateur Backend", version="0.1.0")

# Origines explicites (local) + regex pour couvrir les déploiements Vercel
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    # Tu pourras ajouter ici ton URL Vercel exacte si tu veux restreindre davantage :
    # "https://ton-app.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,                  # correspondances exactes
    allow_origin_regex=r"^https://.*\.vercel\.app$",# tous les sous-domaines Vercel en HTTPS
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def _startup():
    init_db()

# === Branchements ===
app.include_router(ping_router)       # /api/ping
app.include_router(users_router)      # /api/users/...
app.include_router(profiles_router)   # /api/profiles/...
app.include_router(quote_router)      # /api/quote

# sans /api (pour matcher le proxy Next qui appelle /calendar et /search)
app.include_router(calendar_router)   # /calendar
app.include_router(search_router)     # /search

@app.get("/health")
def health():
    return {"ok": True}