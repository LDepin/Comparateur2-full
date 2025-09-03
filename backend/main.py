# comparateur2/backend/main.py
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta
import calendar as cal
import hashlib
import random
from typing import Optional, Dict, Any, List

app = FastAPI(title="Comparateur Backend")

# CORS (dev: autorise tout; en prod, restreindre)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Règles d'exemple UM / animaux par compagnie
AIRLINE_RULES: Dict[str, Dict[str, bool]] = {
    "VY": {"um_ok": True,  "animal_ok": False},
    "IB": {"um_ok": False, "animal_ok": True},
    "U2": {"um_ok": True,  "animal_ok": True},
    "AF": {"um_ok": True,  "animal_ok": True},
    "KL": {"um_ok": True,  "animal_ok": False},
}
CARRIERS = list(AIRLINE_RULES.keys())

def _rng_for_key(key: str) -> random.Random:
    seed = int(hashlib.md5(key.encode("utf-8")).hexdigest(), 16) % (2**32)
    return random.Random(seed)

def _simulate_offers(origin: str, destination: str, date_str: str, nonstop: Optional[bool], rng: random.Random) -> List[Dict[str, Any]]:
    offers: List[Dict[str, Any]] = []
    try:
        base = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return offers

    n_offers = rng.randint(3, 6)
    for _ in range(n_offers):
        if nonstop is True:
            stops = 0
        elif nonstop is False:
            stops = rng.choice([1, 1, 2])
        else:
            stops = rng.choice([0, 0, 1, 1, 2])

        segments = []
        depart_time = base.replace(hour=rng.randint(6, 18), minute=rng.choice([0,15,30,45]), second=0, microsecond=0)
        from_code = origin
        carriers_used = set()
        total_minutes = 0

        for s in range(stops + 1):
            to_code = destination if s == stops else f"X{rng.randint(1,99)}"
            carrier = rng.choice(CARRIERS)
            seg_minutes = rng.randint(60, 180)
            arr_time = depart_time + timedelta(minutes=seg_minutes)

            seg = {
                "mode": "plane",
                "carrier": carrier,
                "from": from_code,
                "to": to_code,
                "dep": depart_time.isoformat(timespec="minutes"),
                "arr": arr_time.isoformat(timespec="minutes"),
                "duration_minutes": seg_minutes,
            }
            segments.append(seg)
            carriers_used.add(carrier)
            total_minutes += seg_minutes

            if s < stops:
                layover = rng.randint(30, 150)
                total_minutes += layover
                depart_time = arr_time + timedelta(minutes=layover)
                from_code = to_code

        price = round(max(20.0, total_minutes * 0.6) + rng.uniform(-15, 60), 2)
        um_ok = all(AIRLINE_RULES.get(c, {"um_ok": True})["um_ok"] for c in carriers_used)
        animal_ok = all(AIRLINE_RULES.get(c, {"animal_ok": True})["animal_ok"] for c in carriers_used)

        offers.append({
            "prix": price,
            "duree_totale_minutes": total_minutes,
            "duree_totale": f"PT{total_minutes//60}H{total_minutes%60}M",
            "escales": stops,
            "segments": segments,
            "um_ok": um_ok,
            "animal_ok": animal_ok,
        })

    return offers

def _apply_filters(offers: List[Dict[str, Any]], nonstop: Optional[bool], require_um: bool, require_animal: bool) -> List[Dict[str, Any]]:
    out = []
    for o in offers:
        if nonstop is True and o["escales"] != 0:
            continue
        if nonstop is False and o["escales"] == 0:
            continue
        if require_um and not o.get("um_ok", False):
            continue
        if require_animal and not o.get("animal_ok", False):
            continue
        out.append(o)
    return out

def _apply_sort(offers: List[Dict[str, Any]], sort: str) -> List[Dict[str, Any]]:
    if sort == "duration":
        return sorted(offers, key=lambda x: x.get("duree_totale_minutes", 999999))
    return sorted(offers, key=lambda x: x.get("prix", 999999.0))

@app.get("/search")
async def search(
    origin: str,
    destination: str,
    date: str,
    sort: str = Query("price", pattern="^(price|duration)$"),
    nonstop: Optional[bool] = None,
    require_um: bool = False,
    require_animal: bool = False,
):
    rng = _rng_for_key(f"{origin}-{destination}-{date}")
    offers = _simulate_offers(origin, destination, date, nonstop, rng)
    offers = _apply_filters(offers, nonstop, require_um, require_animal)
    offers = _apply_sort(offers, sort)
    return {"results": offers}

@app.get("/calendar")
async def calendar(
    origin: str,
    destination: str,
    month: str,
    sort: str = Query("price", pattern="^(price|duration)$"),
    nonstop: Optional[bool] = None,
    require_um: bool = False,
    require_animal: bool = False,
    with_flights: bool = False,
):
    try:
        dt = datetime.strptime(month, "%Y-%m")
    except ValueError:
        return {"calendar": {}}

    year, mon = dt.year, dt.month
    days_in_month = cal.monthrange(year, mon)[1]
    cal_map: Dict[str, Dict[str, Any]] = {}

    for d in range(1, days_in_month + 1):
        date_str = f"{year:04d}-{mon:02d}-{d:02d}"
        rng = _rng_for_key(f"{origin}-{destination}-{date_str}")
        offers = _simulate_offers(origin, destination, date_str, nonstop, rng)
        offers = _apply_filters(offers, nonstop, require_um, require_animal)
        if not offers:
            cal_map[date_str] = {"prix": None, "disponible": False}
        else:
            best = _apply_sort(offers, sort)[0]
            entry = {"prix": round(best["prix"], 2), "disponible": True}
            if with_flights:
                entry["flights"] = _apply_sort(offers, sort)[:3]
            cal_map[date_str] = entry

    return {"calendar": cal_map}