#!/bin/bash
# Script pour préparer le backend

cd "$(dirname "$0")"  # Aller dans le dossier backend
source venv/bin/activate  # Activer le venv

echo "Installation des dépendances depuis requirements.txt..."
pip install -r requirements.txt

echo "Dépendances installées ✅"
