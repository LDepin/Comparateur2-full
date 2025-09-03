#!/bin/bash
# Script pour démarrer le backend FastAPI

cd "$(dirname "$0")"   # Aller dans le dossier backend
source venv/bin/activate  # Activer le venv
python3 -m uvicorn main:app --reload

