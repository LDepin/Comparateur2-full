from __future__ import annotations
import os
from typing import Dict, Any, List, Optional
from datetime import datetime, date, timedelta

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

# -------------------------------------------------------------------
# Config simple
# -------------------------------------------------------------------
USE_ENTUR = os.getenv("USE_ENTUR", "0") == "1"
USE_RESROBOT = os.getenv("USE_RESROBOT", "0") == "1"
RESROBOT_KEY = os.getenv("RESROBOT_KEY", "")

app = FastAPI(title="Comparateur2 Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------------------
# Providers (stubs / existants)
# -------------------------------------------------------------------
# NOTE: on garde volontairement un "fallback vols" pour PAR↔BCN
# afin que l’UI soit toujours testable, même sans clés externes.

def _fake_flights(origin: str, destination: str, d: date) -> List[Dict[str, Any]]:
    # Génère des vols fictifs stables par jour
    base_price = 30 + (d.day % 12) * 4
    res: List[Dict[str, Any]] = [
        {
            "compagnie": "V7",
            "prix": base_price + 5,
            "depart_iso": datetime(d.year, d.month, d.day, 7, 25).isoformat() + "Z",
            "arrivee_iso": datetime(d.year, d.month, d.day, 9, 32).isoformat() + "Z",
            "duree_minutes": 127,
            "escales": 0,
            "um_ok": True,
            "animal_ok": False,
        },
        {
            "compagnie": "AF",
            "prix": base_price + 18,
            "depart_iso": datetime(d.year, d.month, d.day, 13, 40).isoformat() + "Z",
            "arrivee_iso": datetime(d.year, d.month, d.day, 15, 30).isoformat() + "Z",
            "duree_minutes": 110,
            "escales": 0,
            "um_ok": True,
            "animal_ok": True,
        },
        {
            "compagnie": "U2",
            "prix": base_price + 35,
            "depart_iso": datetime(d.year, d.month, d.day, 10, 20).isoformat() + "Z",
            "arrivee_iso": datetime(d.year, d.month, d.day, 13, 7).isoformat() + "Z",
            "duree_minutes": 167,
            "escales": 1,
            "um_ok": False,
            "animal_ok": True,
        },
    ]
    return res

async def provider_search_all(origin: str, destination: str, d: date) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    # TODO: brancher Entur / ResRobot réels ici (quand tu veux)
    # if USE_ENTUR: results += await entur_search(...)
    # if USE_RESROBOT: results += await resrobot_search(...)
    # Fallback vols pour tests :
    results += _fake_flights(origin, destination, d)
    return results

# -------------------------------------------------------------------
# Utilitaires
# -------------------------------------------------------------------
def apply_filters(
    flights: List[Dict[str, Any]],
    direct: bool,
    um: bool,
    pets: bool,
) -> List[Dict[str, Any]]:
    res = flights
    if direct:
        res = [f for f in res if int(f.get("escales") or 0) == 0]
    if um:
        res = [f for f in res if bool(f.get("um_ok"))]
    if pets:
        res = [f for f in res if bool(f.get("animal_ok"))]
    return res

def month_days(year: int, month: int) -> List[date]:
    start = date(year, month, 1)
    if month == 12:
        nxt = date(year + 1, 1, 1)
    else:
        nxt = date(year, month + 1, 1)
    days: List[date] = []
    cur = start
    while cur < nxt:
        days.append(cur)
        cur = cur + timedelta(days=1)
    return days

# -------------------------------------------------------------------
# Endpoints
# -------------------------------------------------------------------
@app.get("/ping")
def ping() -> Dict[str, Any]:
    return {"ok": True, "ts": int(datetime.utcnow().timestamp() * 1000)}

@app.get("/search")
async def search(
    origin: str = Query(..., min_length=3, max_length=12),
    destination: str = Query(..., min_length=3, max_length=12),
    date_str: Optional[str] = Query(None, alias="date"),
    direct: int = 0,
    um: int = 0,
    pets: int = 0,
) -> Dict[str, Any]:
    """
    Recherche pour un jour (flights-like).
    """
    if not date_str:
        date_obj = date.today()
    else:
        date_obj = datetime.fromisoformat(date_str).date()

    flights = await provider_search_all(origin, destination, date_obj)
    filtered = apply_filters(flights, bool(direct), bool(um), bool(pets))
    return {"results": filtered}

@app.get("/calendar")
async def calendar(
    origin: str = Query(..., min_length=3, max_length=12),
    destination: str = Query(..., min_length=3, max_length=12),
    month: str = Query(..., regex=r"^\d{4}-\d{2}$"),  # YYYY-MM
    direct: int = 0,
    um: int = 0,
    pets: int = 0,
) -> Dict[str, Any]:
    """
    Min/Disponibilité par jour pour le mois demandé, APRES filtres.
    """
    year = int(month.split("-")[0])
    mon = int(month.split("-")[1])

    cal: Dict[str, Dict[str, Any]] = {}
    for d in month_days(year, mon):
        flights = await provider_search_all(origin, destination, d)
        filtered = apply_filters(flights, bool(direct), bool(um), bool(pets))
        if not filtered:
            cal[d.isoformat()] = {"prix": None, "disponible": False}
        else:
            m = min(int(f["prix"]) for f in filtered if "prix" in f)
            cal[d.isoformat()] = {"prix": m, "disponible": True}

    return {"calendar": cal}