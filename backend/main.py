from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta, date as date_cls
import hashlib, random, math
import calendar as pycal

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# --- Règles UM / animaux par compagnie (exemple simple, garde ce bloc) ---
AIRLINE_RULES: Dict[str, Dict[str, bool]] = {
    "VY": {"um_ok": False, "animal_ok": True},
    "IB": {"um_ok": True,  "animal_ok": False},
    "U2": {"um_ok": False, "animal_ok": True},
    "AF": {"um_ok": True,  "animal_ok": True},
    "KL": {"um_ok": True,  "animal_ok": False},
}
CARRIERS: List[str] = list(AIRLINE_RULES.keys())

# --- Utils ------------------------------------------------------------------
def md5_int(s: str) -> int:
    return int(hashlib.md5(s.encode("utf-8")).hexdigest(), 16) & 0x7FFFFFFF

def seed_rng(origin: str, destination: str, ymd: str) -> random.Random:
    """Seed déterministe par O/D + date pour avoir des prix cohérents."""
    return random.Random(md5_int(f"{origin}|{destination}|{ymd}"))

def iso(ymd: str, hour: int, minute: int) -> str:
    return f"{ymd}T{hour:02d}:{minute:02d}"

def minutes_to_iso_dur(m: int) -> str:
    h, r = divmod(m, 60)
    return f"PT{h}H{r}M"

def od_base_price(origin: str, destination: str) -> float:
    """Prix de base pseudo-distance O/D, stable."""
    h = md5_int(f"{origin}>{destination}") % 400
    return 40.0 + (h / 10.0)  # ~40–80 €

# --- Générateur unique de vols (utilisé par /search ET /calendar) ----------
def generate_flights(origin: str, destination: str, ymd: str) -> List[Dict]:
    rng = seed_rng(origin, destination, ymd)

    # combien de vols ce jour-là
    n = rng.randint(4, 8)

    # saisonnalité (petite variation mensuelle)
    dt = datetime.strptime(ymd, "%Y-%m-%d").date()
    season = 1.0 + 0.08 * math.sin((dt.timetuple().tm_yday / 365.0) * 2 * math.pi)

    base = od_base_price(origin, destination) * season  # base stable + saison

    flights: List[Dict] = []
    for _ in range(n):
        carrier = rng.choice(CARRIERS)
        rules = AIRLINE_RULES[carrier]

        # direct vs escales
        is_direct = rng.random() < 0.7  # ~70% directs
        escales = 0 if is_direct else rng.choice([1, 2])

        # durée
        if is_direct:
            dur_min = rng.randint(90, 180)  # 1h30–3h
        else:
            # indirect un peu plus long
            dur_min = rng.randint(150, 300) + 45 * escales

        # heure de départ
        dep_h = rng.randint(6, 21)
        dep_m = rng.choice([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55])
        arr = (datetime.strptime(ymd + f" {dep_h:02d}:{dep_m:02d}", "%Y-%m-%d %H:%M")
               + timedelta(minutes=dur_min))

        # prix = base +/- bruit + pénalité escales + “heure”
        price_noise = rng.uniform(-10, 25)
        stop_penalty = 0 if is_direct else (15 * escales + rng.uniform(0, 10))
        tod_penalty = 5 if 7 <= dep_h <= 9 or 17 <= dep_h <= 20 else 0
        prix = max(25, round(base + price_noise + stop_penalty + tod_penalty, 2))

        flights.append({
            "compagnie": carrier,
            "prix": prix,
            "depart": origin,
            "arrivee": destination,
            "heure_depart": iso(ymd, dep_h, dep_m),
            "heure_arrivee": iso(ymd, arr.hour, arr.minute),
            "duree": minutes_to_iso_dur(dur_min),
            "escales": escales,
            "um_ok": rules["um_ok"],
            "animal_ok": rules["animal_ok"],
        })
    # tri prix par défaut, stable
    flights.sort(key=lambda f: f["prix"])
    return flights

# --- Endpoints --------------------------------------------------------------
@app.get("/ping")
def ping():
    return {"ok": True, "ts": int(datetime.utcnow().timestamp() * 1000)}

@app.get("/search")
def search(
    origin: str = Query(..., min_length=2, max_length=5),
    destination: str = Query(..., min_length=2, max_length=5),
    date: str = Query(..., regex=r"^\d{4}-\d{2}-\d{2}$"),
    direct: Optional[int] = Query(None, ge=0, le=1),
):
    flights = generate_flights(origin, destination, date)
    if direct is not None and direct == 1:
        flights = [f for f in flights if f["escales"] == 0]
    # déjà trié par prix
    return {"results": flights}

@app.get("/calendar")
def calendar(
    origin: str = Query(..., min_length=2, max_length=5),
    destination: str = Query(..., min_length=2, max_length=5),
    month: str = Query(..., regex=r"^\d{4}-\d{2}$"),
    direct: Optional[int] = Query(None, ge=0, le=1),
):
    # bornes du mois
    year, mon = map(int, month.split("-"))
    _, days_in_month = pycal.monthrange(year, mon)

    out: Dict[str, Dict[str, object]] = {}
    for day in range(1, days_in_month + 1):
        ymd = f"{year:04d}-{mon:02d}-{day:02d}"
        flights = generate_flights(origin, destination, ymd)
        if direct is not None and direct == 1:
            flights = [f for f in flights if f["escales"] == 0]

        if flights:
            min_price = min(f["prix"] for f in flights)
            out[ymd] = {"prix": float(min_price), "disponible": True}
        else:
            out[ymd] = {"prix": None, "disponible": False}

    return {"calendar": out}