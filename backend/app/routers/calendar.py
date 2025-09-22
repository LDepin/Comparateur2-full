# backend/app/routers/calendar.py
from __future__ import annotations
from fastapi import APIRouter, Query
from typing import Dict, Any, Optional
import os

from ..services.normalize import normalize_criteria
from ..services.calendar_aggregator import build_month

# Sélection du provider via l'ENV (compat simple)
PROVIDER_NAME = os.getenv("PROVIDERS", "dummy").strip().lower()
if PROVIDER_NAME == "dummy":
    # NOTE: providers est un paquet voisin de app/
    from providers import dummy as provider
else:
    raise NotImplementedError(f"Provider inconnu: {PROVIDER_NAME}")

router = APIRouter(prefix="", tags=["calendar"])  # pas de /api pour matcher le front

@router.get("/calendar")
def get_calendar(
    origin: str = Query(..., min_length=3),
    destination: str = Query(..., min_length=3),
    month: str = Query(..., description="YYYY-MM"),
    # critères optionnels — pass-through
    adults: Optional[int] = 1,
    childrenAges: Optional[str] = None,
    infants: Optional[int] = 0,
    um: Optional[int] = 0,
    umAges: Optional[str] = None,
    pets: Optional[int] = 0,
    bagsSoute: Optional[int] = 0,
    bagsCabin: Optional[int] = 0,
    cabin: Optional[str] = "eco",
    direct: Optional[int] = 0,
    fareType: Optional[str] = None,
    resident: Optional[int] = 0,
):
    """
    Renvoie { "calendar": { "YYYY-MM-DD": { "prix": int|null, "disponible": bool }, ... } }
    Le calcul du mois est réalisé en itérant sur *chaque jour* (cache jour utilisé sous le capot).
    """
    # Normalisation homogène des critères (clé de cache stable + pricing identique à /search)
    criteria: Dict[str, Any] = normalize_criteria({
        "adults": adults,
        "childrenAges": childrenAges,
        "infants": infants,
        "um": um,
        "umAges": umAges,
        "pets": pets,
        "bagsSoute": bagsSoute,
        "bagsCabin": bagsCabin,
        "cabin": cabin,
        "direct": direct,
        "fareType": fareType,
        "resident": resident,
    })

    if len(month) != 7 or month[4] != "-" or not month.replace("-", "").isdigit():
        return {"calendar": {}}

    cal = build_month(origin.upper(), destination.upper(), month, criteria, provider)
    return {"calendar": cal}