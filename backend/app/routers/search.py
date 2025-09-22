# backend/app/routers/search.py
from __future__ import annotations
from fastapi import APIRouter, Query
from typing import Dict, Any, Optional, List
import os

from ..services.normalize import normalize_criteria, sanitize_price, normalize_flight
from ..services.calendar_aggregator import update_month_cache_min_if_present

# Sélection du provider via l'ENV (compat simple)
PROVIDER_NAME = os.getenv("PROVIDERS", "dummy").strip().lower()
if PROVIDER_NAME == "dummy":
    from providers import dummy as provider
else:
    raise NotImplementedError(f"Provider inconnu: {PROVIDER_NAME}")

router = APIRouter(prefix="", tags=["search"])  # pas de /api pour matcher le front

@router.get("/search")
def search_flights(
    origin: str = Query(..., min_length=3),
    destination: str = Query(..., min_length=3),
    date: str = Query(..., description="YYYY-MM-DD"),
    # mêmes critères qu'en /calendar
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
    Renvoie { "results": [ { prix, compagnie, escales, um_ok, animal_ok, departISO, arriveeISO, ... }, ... ] }
    Prix > 0 uniquement, triés par prix croissant.
    Le min renvoyé (1er élément) doit correspondre au min de /calendar pour ce jour.
    """
    if len(date) != 10 or date[4] != "-" or date[7] != "-" or not date.replace("-", "").isdigit():
        return {"results": []}

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

    raw_list = provider.get_day_flights(origin.upper(), destination.upper(), date, criteria)
    normalized = [normalize_flight(r, criteria) for r in raw_list]
    normalized = [f for f in normalized if sanitize_price(f.get("prix")) is not None]

    # tri prix croissant
    normalized.sort(key=lambda f: f.get("prix", 10**9))

    # met à jour le cache "mois" si besoin pour la cohérence calendrier ↔ jour
    min_price = normalized[0]["prix"] if normalized else None
    update_month_cache_min_if_present(origin.upper(), destination.upper(), date, criteria, min_price)

    return {"results": normalized}