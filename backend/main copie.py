from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta
import random

app = FastAPI()

# Autoriser frontend à interroger backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Générer vols simulés pour une date donnée
def generate_flights(origin: str, destination: str, date: str):
    compagnies = ["VY", "IB", "U2", "AF", "FR"]
    flights = []
    base_date = datetime.fromisoformat(date)

    for i in range(random.randint(2, 5)):  # 2 à 5 vols par jour
        compagnie = random.choice(compagnies)
        depart_time = base_date + timedelta(hours=random.randint(6, 20))
        duree_minutes = random.randint(90, 240)  # entre 1h30 et 4h
        arrivee_time = depart_time + timedelta(minutes=duree_minutes)

        prix = round(random.uniform(80, 250), 2)

        flights.append({
            "compagnie": compagnie,
            "prix": prix,
            "depart": origin,
            "arrivee": destination,
            "heure_depart": depart_time.isoformat(timespec="minutes"),
            "heure_arrivee": arrivee_time.isoformat(timespec="minutes"),
            "duree": f"PT{duree_minutes//60}H{duree_minutes%60}M",
            "escales": random.choice([0, 1]),
            "um_ok": random.choice([True, False]),
            "animal_ok": random.choice([True, False]),
        })

    return flights

# Endpoint recherche de vols
@app.get("/search")
def search(origin: str, destination: str, date: str):
    flights = generate_flights(origin, destination, date)
    return {"results": flights}

# Endpoint calendrier avec prix du jour
@app.get("/calendar")
def calendar(origin: str, destination: str, month: str):
    """
    month doit être sous format YYYY-MM
    Exemple: 2025-09
    """
    try:
        start_date = datetime.strptime(month + "-01", "%Y-%m-%d")
    except ValueError:
        return {"calendar": {}}

    # Calculer nombre de jours dans le mois
    next_month = start_date.replace(day=28) + timedelta(days=4)
    last_day = (next_month - timedelta(days=next_month.day)).day

    cal = {}

    for day in range(1, last_day + 1):
        d = start_date.replace(day=day).strftime("%Y-%m-%d")
        flights = generate_flights(origin, destination, d)

        if flights:
            min_price = min(f["prix"] for f in flights)
            cal[d] = {"prix": min_price, "disponible": True}
        else:
            cal[d] = {"prix": None, "disponible": False}

    return {"calendar": cal}