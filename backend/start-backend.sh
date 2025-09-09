#!/bin/bash
cd "$(dirname "$0")"
source venv/bin/activate
export USE_ENTUR=1
exec python3 -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
