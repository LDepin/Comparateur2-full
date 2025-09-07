from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta, date
import hashlib
import random

app = FastAPI()

# CORS large pour dev et Vercel (en prod tu pourras restreindre)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- règles UM / animaux par compagnie (exemple) ---
AIRLINE_RULES: Dict[str, Dict[str, bool]] = {
    "AF": {"um_ok": True,  "animal_ok": True},
    "U2": {"um_ok": False, "animal_ok": True},
    "VY": {"um_ok": False, "animal_ok": True},
    "IB": {"um_ok": True,  "animal_ok": False},
    "KL": {"um_ok": True,  "animal_ok": False},
}
CARRIERS = list(AIRLINE_RULES.keys())


def prng_for(*parts: str) -> random.Random:
    """PRNG déterministe à partir des paramètres (origin, destination, date)."""
    s = "|".join(parts)
    h = hashlib.sha256(s.encode("utf-8")).hexdigest()
    seed = int(h[:16], 16)
    rng = random.Random(seed)
    return rng


def base_price_for(origin: str, destination: str, ymd: str) -> int:
    """
    Base de prix stable pour un jour donné.
    Utilise la combinaison (route, jour du mois) -> prix réaliste.
    """
    rng = prng_for("BASE", origin, destination, ymd)
    # Composantes : distance approx (via hash), jour de semaine, saison
    dist_factor = 0.8 + rng.random() * 0.8           # 0.8..1.6
    dow_factor = [0.95, 0.9, 0.9, 1.0, 1.1, 1.3, 1.25][datetime.fromisoformat(ymd).weekday()]
    season_bump = 1.0

    m = int(ymd[5:7])
    if m in (6, 7, 8):           # été
        season_bump = 1.15
    elif m in (12, 1):           # fêtes
        season_bump = 1.1

    # plancher réaliste
    base = int(round(35 * dist_factor * dow_factor * season_bump))
    # pas en-dessous de 28 €
    return max(base, 28)


# tout en haut du fichier si tu veux, on garde un flag clair
ALWAYS_AVAILABLE = True

def available_for(origin: str, destination: str, ymd: str) -> bool:
    if ALWAYS_AVAILABLE:
        return True
    rng = prng_for("AVL", origin, destination, ymd)
    return rng.random() < 0.8


def day_min_price(origin: str, destination: str, ymd: str) -> int:
    """Min prix du jour (utilisé par /calendar ET pour fabriquer les vols)."""
    rng = prng_for("MIN", origin, destination, ymd)
    base = base_price_for(origin, destination, ymd)
    # fluctuation légère mais stable
    factor = 0.9 + 0.25 * rng.random()   # 0.9..1.15
    price = int(round(base * factor))
    return max(price, 20)


def fabricate_flights(origin: str, destination: str, ymd: str, direct_only: bool) -> List[Dict[str, Any]]:
    """
    Génère une liste de vols stable pour un jour, cohérente avec day_min_price().
    Le MIN des résultats == prix affiché dans le calendrier.
    """
    if not available_for(origin, destination, ymd):
        return []

    rng = prng_for("FLIGHTS", origin, destination, ymd)
    min_p = day_min_price(origin, destination, ymd)

    flights: List[Dict[str, Any]] = []
    day_dt = datetime.fromisoformat(ymd)
    nb = 6 if not direct_only else 3

    for i in range(nb):
        # timings stables
        dep_hour = 6 + i * 2 + rng.randint(0, 1)
        dep_min = rng.choice([0, 10, 20, 30, 40, 50])
        dep_dt = day_dt.replace(hour=dep_hour % 24, minute=dep_min)

        # direct vs 1 escale (si direct_only => toujours 0)
        escales = 0 if direct_only else (0 if rng.random() < 0.7 else 1)

        # durée
        base_dur_min = 110 + rng.randint(-10, 20)     # 1h50 ±
        if escales == 1:
            base_dur_min += 50 + rng.randint(0, 40)

        arr_dt = dep_dt + timedelta(minutes=base_dur_min)

        # Compagnie & prix
        comp = rng.choice(CARRIERS)
        spread = 0 if i == 0 else rng.randint(4, 60)  # 1er vol = min_p
        price = min_p + spread

        flights.append({
            "compagnie": comp,
            "prix": price,
            "depart": origin,
            "arrivee": destination,
            "heure_depart": dep_dt.isoformat(timespec="minutes"),
            "heure_arrivee": arr_dt.isoformat(timespec="minutes"),
            "duree": f"PT{base_dur_min//60}H{base_dur_min%60}M",
            "escales": escales,
            "um_ok": AIRLINE_RULES[comp]["um_ok"],
            "animal_ok": AIRLINE_RULES[comp]["animal_ok"],
        })

    # tri par prix croissant pour avoir le min en premier (cohérent avec UI par défaut)
    flights.sort(key=lambda f: f["prix"])
    return flights


@app.get("/ping")
def ping() -> Dict[str, Any]:
    return {"ok": True, "ts": int(datetime.now().timestamp() * 1000)}


@app.get("/calendar")
def calendar(
    origin: str = Query(..., min_length=3, max_length=3),
    destination: str = Query(..., min_length=3, max_length=3),
    month: str = Query(..., regex=r"^\d{4}-\d{2}$")
) -> Dict[str, Dict[str, Dict[str, Any]]]:
    # bornes du mois
    first = date.fromisoformat(month + "-01")
    if first.month == 12:
        nxt = date(first.year + 1, 1, 1)
    else:
        nxt = date(first.year, first.month + 1, 1)

    out: Dict[str, Dict[str, Any]] = {}
    d = first
    while d < nxt:
        ymd = d.isoformat()
        dispo = available_for(origin, destination, ymd)
        price = day_min_price(origin, destination, ymd) if dispo else None
        out[ymd] = {"prix": price, "disponible": dispo}
        d += timedelta(days=1)

    return {"calendar": out}


@app.get("/search")
def search(
    origin: str = Query(..., min_length=3, max_length=3),
    destination: str = Query(..., min_length=3, max_length=3),
    date: str = Query(..., regex=r"^\d{4}-\d{2}-\d{2}$"),
    direct: int = Query(0, ge=0, le=1)
) -> Dict[str, List[Dict[str, Any]]]:
    direct_only = bool(direct)
    flights = fabricate_flights(origin, destination, date, direct_only)
    return {"results": flights}