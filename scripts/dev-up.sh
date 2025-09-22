#!/usr/bin/env bash
set -e

# --- BACKEND ---
( 
  cd backend
  [ -d .venv ] || python3 -m venv .venv
  source .venv/bin/activate
  python -m pip install -U pip >/dev/null
  pip install -r requirements.txt >/dev/null
  export PYTHONPATH=$(pwd)
  # Assure un secret stable
  grep -q '^AUTH_JWT_SECRET=' .env || echo 'AUTH_JWT_SECRET=supersecret-demo-2025' >> .env
  # Kill vieux serveurs
  pkill -f 'uvicorn.*app.main:app' 2>/dev/null || true
  # Lance backend
  python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload &
  echo "[backend] lancé: http://127.0.0.1:8000"
) 

# --- FRONTEND ---
(
  cd .
  echo 'NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000' > .env.local
  npm install >/dev/null
  npm run dev &
  echo "[frontend] lancé: http://localhost:3000"
)

# --- TOKEN DEV ---
(
  cd backend
  source .venv/bin/activate
  export PYTHONPATH=$(pwd)
  python -m app.utils.dev_token ludovicdepinpro@gmail.com | pbcopy
  echo "✅ Token dev copié (presse-papiers)."
)

echo "Ouvre /account/profiles, colle le token (Cmd+V) → Enregistrer → Rafraîchir."
