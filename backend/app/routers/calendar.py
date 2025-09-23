# backend/app/routers/calendar.py
from __future__ import annotations

from fastapi import APIRouter, Query, HTTPException
from typing import Dict, Any
from datetime import date as dt_date

from ..services.normalize import normalize_criteria
from ..services.calendar_aggregator import build_month

router = APIRouter(prefix="", tags=["calendar"])  # pas de /api (proxy Next attend /calendar)

def _valid_month(month: str) -> bool:
    return (
        len(month) == 7
        and month[4] == "-"
        and month[:4].isdigit()
        and month[5:7].isdigit()
    )

@router.get("/calendar")
def get_calendar(
    # obligatoires
    origin: str = Query(..., min_length=3, max_length=3),
    destination: str = Query(..., min_length=3, max_length=3),
    month: str = Query(..., description="YYYY-MM"),
    # critères optionnels – pass-through vers normalize_criteria()
    adults: int | None = Query(None, ge=0),
    childrenAges: str | None = Query(None, description="CSV ages enfants (ex: 5,9)"),
    infants: int | None = Query(None, ge=0),
    um: int | None = Query(None),                 # 0/1
    umAges: str | None = Query(None),             # CSV ages UM
    pets: int | None = Query(None),               # 0/1
    bagsSoute: int | None = Query(None, ge=0),
    bagsCabin: int | None = Query(None, ge=0),
    cabin: str | None = Query(None),              # eco|premium|business|first
    direct: int | None = Query(None),             # 0/1
    fareType: str | None = Query(None),
    resident: int | None = Query(None),           # 0/1
):
    """
    Renvoie un calendrier *cohérent jour ↔ jour* :
      { "calendar": { "YYYY-MM-DD": { "prix": int|None, "disponible": bool }, ... } }

    - Source de vérité = agrégation *jour par jour* via les providers actifs (Amadeus en priorité, sinon dummy).
    - Prix invalides (<=0/NaN) exclus.
    - Le min de /calendar pour un jour correspondra au 1er résultat de /search le même jour (grâce au cache DAY:/CAL: côté services).
    """
    if not _valid_month(month):
        raise HTTPException(status_code=400, detail="Paramètre month invalide, attendu YYYY-MM.")

    # Normalise TOUTES les options en un dict de critères stable (utilisé dans la clé de cache)
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

    # Agrégation *jour par jour* (utilise le cache DAY: en interne, puis compose CAL:)
    calendar = build_month(origin=origin, destination=destination, month_ym=month, criteria=criteria)

    return {"calendar": calendar}