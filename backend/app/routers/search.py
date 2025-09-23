# backend/app/routers/search.py
from __future__ import annotations

from fastapi import APIRouter, Query, HTTPException
from typing import Dict, Any, List

from ..services.normalize import normalize_criteria, normalize_flight, sanitize_price
from ..services.providers import build_providers
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["search"])  # pas de /api (proxy Next attend /search)

def _valid_date(d: str) -> bool:
    return (
        len(d) == 10
        and d[4] == "-"
        and d[7] == "-"
        and d[:4].isdigit()
        and d[5:7].isdigit()
        and d[8:10].isdigit()
    )

# Instancie la chaîne de providers une seule fois au chargement du module
_PROVIDERS = build_providers()

@router.get("/search")
def search_flights(
    # obligatoires
    origin: str = Query(..., min_length=3, max_length=3),
    destination: str = Query(..., min_length=3, max_length=3),
    date: str = Query(..., description="YYYY-MM-DD"),
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
    # tri demandé par le front (mais on renvoie déjà trié prix asc)
    sort: str | None = Query(None),
):
    """
    Renvoie:
      { "results": [ { prix, compagnie, escales, um_ok, animal_ok, departISO, arriveeISO, duree|duree_minutes }, ... ] }

    - Essaie les providers dans l’ordre (Amadeus si dispo, sinon dummy).
    - Prix invalides (<=0/NaN) filtrés.
    - Résultats triés par prix croissant.
    """
    if not _valid_date(date):
        raise HTTPException(status_code=400, detail="Paramètre date invalide, attendu YYYY-MM-DD.")

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

    # Essaie les providers dans l'ordre configuré
    raw: List[Dict[str, Any]] = []
    for p in _PROVIDERS:
        try:
            got = p.get_day_flights(origin, destination, date, criteria)  # type: ignore[attr-defined]
        except Exception as e:
            logger.warning("Provider %s a échoué: %s", getattr(p, "name", "?"), e)
            got = []
        if got:
            raw = got
            break
    # Si tous vides, on renvoie liste vide
    if not raw:
        return {"results": []}

    # Normalisation + filtre prix
    results = []
    for r in raw:
        f = normalize_flight(r, criteria)
        if f is None:
            continue
        prix_ok = sanitize_price(f.get("prix"))
        if prix_ok is None:
            continue
        f["prix"] = prix_ok
        results.append(f)

    # Tri prix asc (garantit cohérence avec min de /calendar)
    results.sort(key=lambda x: x.get("prix", 10**9))

    return {"results": results}