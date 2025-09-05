from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any
from datetime import datetime, timedelta, date
import math
import random

app = FastAPI()

# CORS large pour dev et Vercel
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def _seed(*parts) -> random.Random:
    s = "|".join(map(str, parts))
    return random.Random(abs(hash(s)) % (2**32))

def _to_iso(dt: datetime) -> str:
    # format ISO solide pour Safari/Chrome/Firefox
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")

def _days_in_month(year: int, month: int) -> int:
    if month == 12:
        nxt = date(year + 1, 1, 1)
    else:
        nxt = date(year, month + 1, 1)
    return (nxt - date(year, month, 1)).days

# petites “règles” de compat pour UM/animaux
def _rules_for_airline(code: str) -> Dict[str, bool]:
    # Purement simulé ; stable grâce au hash
    r = _seed("airline", code).random()
    return {
        "um_ok": r > 0.25,       # ~75% OK
        "animal_ok": r > 0.5,    # ~50% OK
    }

# --- ENDPOINTS ---------------------------------------------------------------

@app.get("/")
def root():
    return {"ok": True, "service": "comparateur-backend"}

@app.get("/calendar")
def calendar(
    origin: str = Query(..., min_length=3, max_length=5),
    destination: str = Query(..., min_length=3, max_length=5),
    month: str = Query(..., regex=r"^\d{4}-\d{2}$"),
):
    """Retourne un calendrier des prix minimum par jour pour un mois AAAA-MM."""
    year = int(month[:4])
    m = int(month[5:7])
    n_days = _days_in_month(year, m)
    rr = _seed("cal", origin, destination, month)

    # base prix stable selon OD + mois
    base = 40 + int(rr.random() * 40)  # 40-80€
    out: Dict[str, Dict[str, Any]] = {}
    for d in range(1, n_days + 1):
        ymd = f"{year:04d}-{m:02d}-{d:02d}"
        r = _seed(origin, destination, ymd)
        available = r.random() > 0.08  # ~92% dispo
        if not available:
            out[ymd] = {"prix": None, "disponible": False}
            continue
        # bruit saisonnier + bruit aléatoire
        season = 1.0 + 0.35 * math.sin(d / 31 * math.pi * 2)
        noise = 0.8 + 0.4 * r.random()
        price = max(18, round(base * season * noise))
        out[ymd] = {"prix": price, "disponible": True}
    return {"calendar": out}

@app.get("/search")
def search(
    origin: str = Query(..., min_length=3, max_length=5),
    destination: str = Query(..., min_length=3, max_length=5),
    date: str = Query(..., regex=r"^\d{4}-\d{2}-\d{2}$"),
    non_stop: bool = Query(False),
):
    """
    Retourne une liste de propositions de vols simulées :
    - horaires ISO (UTC) parseables partout
    - segments (directs / 1 escale parfois)
    - durée totale en minutes
    - UM / animaux par compagnie
    """
    rday = _seed("search", origin, destination, date)
    base_depart = datetime.strptime(date, "%Y-%m-%d").replace(hour=6, minute=0)

    # pool compagnies plausibles
    airlines = ["VY", "IB", "U2", "AF", "TO", "V7", "HV"]
    a1 = airlines[int(rday.random() * len(airlines))]
    a2 = airlines[int(rday.random() * len(airlines))]

    results = []
    count = 4 if non_stop else 5

    for i in range(count):
        r = _seed(date, origin, destination, i)

        # départ entre 06:00 et 21:00
        dep_offset_min = int(r.random() * (15 * 60))  # 0..900 minutes
        dep = base_depart + timedelta(minutes=dep_offset_min)

        # direct vs 1 escale
        has_stop = (r.random() > 0.65) and (not non_stop)

        if not has_stop:
            duration_min = int(95 + r.random() * 70)  # 95..165
            arr = dep + timedelta(minutes=duration_min)
            airline = a1 if i % 2 == 0 else a2
            rules = _rules_for_airline(airline)
            seg = {
                "origin": origin,
                "destination": destination,
                "depart_iso": _to_iso(dep),
                "arrivee_iso": _to_iso(arr),
                "compagnie": airline,
                "numero": f"{airline}{int(100 + r.random()*899)}",
                "duree_minutes": duration_min,
            }
            prix = round(38 + (duration_min - 90) * 0.7 + (r.random() * 40), 2)
            results.append({
                "compagnies": [airline],
                "prix": prix,
                "depart_code": origin,
                "arrivee_code": destination,
                "depart_iso": seg["depart_iso"],
                "arrivee_iso": seg["arrivee_iso"],
                "duree_minutes": duration_min,
                "segments": [seg],
                "escales": 0,
                "um_ok": rules["um_ok"],
                "animal_ok": rules["animal_ok"],
                # champs legacy pour compat
                "vols": [{
                    "depart": origin,
                    "arrivee": destination,
                    "duree": f"PT{duration_min//60}H{duration_min%60}M",
                    "compagnie": airline,
                    "depart_iso": seg["depart_iso"],
                    "arrivee_iso": seg["arrivee_iso"],
                }],
            })
        else:
            # une escale : on fabrique un stop “plausible”
            # stop code : mélange des lettres des deux codes
            mid = (origin[:2] + destination[-1]).upper()
            airline_out = a1
            airline_in = a2 if a2 != a1 else a1

            leg1_min = int(55 + r.random() * 55)     # 55..110
            layover = int(50 + r.random() * 70)      # 50..120
            leg2_min = int(45 + r.random() * 70)     # 45..115
            arr1 = dep + timedelta(minutes=leg1_min)
            dep2 = arr1 + timedelta(minutes=layover)
            arr2 = dep2 + timedelta(minutes=leg2_min)
            duration_min = leg1_min + layover + leg2_min

            rules_mix = {
                "um_ok": _rules_for_airline(airline_out)["um_ok"] and _rules_for_airline(airline_in)["um_ok"],
                "animal_ok": _rules_for_airline(airline_out)["animal_ok"] and _rules_for_airline(airline_in)["animal_ok"],
            }

            seg1 = {
                "origin": origin,
                "destination": mid,
                "depart_iso": _to_iso(dep),
                "arrivee_iso": _to_iso(arr1),
                "compagnie": airline_out,
                "numero": f"{airline_out}{int(100 + r.random()*899)}",
                "duree_minutes": leg1_min,
            }
            seg2 = {
                "origin": mid,
                "destination": destination,
                "depart_iso": _to_iso(dep2),
                "arrivee_iso": _to_iso(arr2),
                "compagnie": airline_in,
                "numero": f"{airline_in}{int(100 + r.random()*899)}",
                "duree_minutes": leg2_min,
            }
            prix = round(52 + (duration_min - 120) * 0.55 + (r.random() * 55), 2)
            results.append({
                "compagnies": list({airline_out, airline_in}),
                "prix": prix,
                "depart_code": origin,
                "arrivee_code": destination,
                "depart_iso": seg1["depart_iso"],
                "arrivee_iso": seg2["arrivee_iso"],
                "duree_minutes": duration_min,
                "segments": [seg1, seg2],
                "escales": 1,
                "um_ok": rules_mix["um_ok"],
                "animal_ok": rules_mix["animal_ok"],
                # compat
                "vols": [
                    {
                        "depart": origin, "arrivee": mid,
                        "duree": f"PT{leg1_min//60}H{leg1_min%60}M",
                        "compagnie": airline_out,
                        "depart_iso": seg1["depart_iso"], "arrivee_iso": seg1["arrivee_iso"],
                    },
                    {
                        "depart": mid, "arrivee": destination,
                        "duree": f"PT{leg2_min//60}H{leg2_min%60}M",
                        "compagnie": airline_in,
                        "depart_iso": seg2["depart_iso"], "arrivee_iso": seg2["arrivee_iso"],
                    },
                ],
            })

    # tri prix
    results.sort(key=lambda x: x["prix"])
    return {"results": results}
