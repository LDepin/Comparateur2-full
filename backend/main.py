from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
from datetime import datetime, date, timedelta
import calendar as calmod
import hashlib, random

app = FastAPI()

# CORS large (dev + Vercel)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Modèle de vol ----------------------------------------------------------
class Flight(BaseModel):
    compagnie: str
    prix: float
    depart: str
    arrivee: str
    heure_depart: str   # ISO string
    heure_arrivee: str  # ISO string
    duree: str          # ISO8601 "PT1H45M"
    escales: int
    um_ok: bool
    animal_ok: bool

# Règles UM/Animaux par compagnie (exemple)
AIRLINE_RULES: Dict[str, Dict[str, bool]] = {
    "VY": {"um_ok": True,  "animal_ok": False},
    "IB": {"um_ok": True,  "animal_ok": True},
    "U2": {"um_ok": False, "animal_ok": True},
    "AF": {"um_ok": True,  "animal_ok": True},
    "KL": {"um_ok": True,  "animal_ok": False},
}
CARRIERS = list(AIRLINE_RULES.keys())


# --- Générateur déterministe de vols (COMMUN à /search et /calendar) -------
def _seed_for(origin: str, destination: str, d: date) -> int:
    s = f"{origin}|{destination}|{d.isoformat()}"
    # graine stable sur 64 bits
    return int.from_bytes(hashlib.sha256(s.encode()).digest()[:8], "big")

def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M")

def _pt_duration(minutes: int) -> str:
    h, m = divmod(minutes, 60)
    return f"PT{h}H{m}M"

def generate_flights(origin: str, destination: str, d: date, direct_only: bool=False) -> List[Flight]:
    rng = random.Random(_seed_for(origin, destination, d))
    flights: List[Flight] = []

    # volume de vols selon jour/semaine
    base_n = 3 + (0 if direct_only else 2) + rng.randint(0, 2)
    weekday = d.weekday()  # 0=Lundi ... 6=Dimanche
    if weekday in (4, 5):  # ven/sam un peu plus
        base_n += 1

    for _ in range(base_n):
        carrier = rng.choice(CARRIERS)

        # départ entre 06:00 et 21:00
        dep_hour = rng.randint(6, 21)
        dep_min = rng.choice((0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55))
        dep_dt = datetime(d.year, d.month, d.day, dep_hour, dep_min)

        # durée 90–180 min (+45–120 min s’il y a escales)
        escales = 0 if direct_only else rng.choice([0, 0, 0, 1])
        dur_min = rng.randint(90, 180) + (rng.randint(45, 120) if escales else 0)
        arr_dt = dep_dt + timedelta(minutes=dur_min)

        # prix de base + modulation jour/semaine + bruit faible → min réaliste 25–35 €
        base_price = 38 + rng.randint(0, 40)
        if weekday in (4, 6):  # ven/dim plus chers
            base_price += 12 + rng.randint(0, 15)
        elif weekday == 2:     # mercredi un peu moins cher
            base_price -= 6
        price = max(25, base_price + rng.randint(-6, 9))

        rules = AIRLINE_RULES[carrier]
        flights.append(
            Flight(
                compagnie=carrier,
                prix=round(float(price), 2),
                depart=origin,
                arrivee=destination,
                heure_depart=_iso(dep_dt),
                heure_arrivee=_iso(arr_dt),
                duree=_pt_duration(dur_min),
                escales=escales,
                um_ok=rules["um_ok"],
                animal_ok=rules["animal_ok"],
            )
        )

    # tri par prix croissant pour cohérence
    flights.sort(key=lambda f: f.prix)
    return flights


# --- Routes -----------------------------------------------------------------
@app.get("/")
def root():
    return {"ok": True, "service": "Comparateur Backend"}

@app.get("/search")
def search(
    origin: str = Query(..., min_length=3, max_length=5),
    destination: str = Query(..., min_length=3, max_length=5),
    date: str = Query(...),           # "YYYY-MM-DD"
    direct: Optional[int] = Query(0), # 1 = vols directs uniquement
    sort: Optional[str] = Query("price")
):
    d = datetime.strptime(date, "%Y-%m-%d").date()
    flights = generate_flights(origin.upper(), destination.upper(), d, direct_only=bool(direct))
    # tri côté serveur pour robustesse
    if sort == "duration":
        flights.sort(key=lambda f: int(f.duree.replace("PT", "").replace("H", " ").replace("M", "").split()[0])*60 +
                              int(f.duree.replace("PT", "").replace("H", " ").replace("M", "").split()[1]))
    else:
        flights.sort(key=lambda f: f.prix)
    return {"results": [f.model_dump() for f in flights]}

@app.get("/calendar")
def calendar(
    origin: str = Query(..., min_length=3, max_length=5),
    destination: str = Query(..., min_length=3, max_length=5),
    month: str = Query(...),             # "YYYY-MM"
    direct: Optional[int] = Query(0),    # <-- nouveau : 1 = vols directs uniquement
):
    year, mon = map(int, month.split("-"))
    first_day = date(year, mon, 1)
    last_day = date(year, mon, calmod.monthrange(year, mon)[1])

    cal: Dict[str, Dict[str, object]] = {}
    cur = first_day
    while cur <= last_day:
        flights = generate_flights(
            origin.upper(),
            destination.upper(),
            cur,
            direct_only=bool(direct)      # <-- important
        )
        if flights:
            min_price = min(f.prix for f in flights)
            cal[cur.isoformat()] = {"prix": round(min_price, 2), "disponible": True}
        else:
            cal[cur.isoformat()] = {"prix": None, "disponible": False}
        cur += timedelta(days=1)

    return {"calendar": cal}