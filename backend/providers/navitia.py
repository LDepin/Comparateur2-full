import os, httpx
from datetime import datetime
from ..models import Option, Leg

NAVITIA_TOKEN = os.getenv("NAVITIA_TOKEN")

async def search_navitia(origin:str, destination:str, date:str):
    """
    FR/EU multimodal. Si NAVITIA_TOKEN absent, renvoie un fallback.
    Docs: https://doc.navitia.io/
    """
    if not NAVITIA_TOKEN:
        # Fallback simple pour garder l'UI vivante
        return [
            Option(
                mode="train",
                price=44.0, currency="EUR",
                total_duration_min=160, transfers=1,
                legs=[Leg(mode="train", origin=origin, destination=destination,
                          depart_iso=f"{date}T07:30:00Z", arrive_iso=f"{date}T10:10:00Z",
                          company="SNCF", number="TGV123", duration_min=160)]
            )
        ]

    url = f"https://api.navitia.io/v1/journeys?from={origin}&to={destination}&datetime={date}T080000"
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(url, auth=(NAVITIA_TOKEN,""))
        r.raise_for_status()
        data = r.json()

    opts = []
    for j in data.get("journeys", []):
        legs=[]
        for s in j.get("sections", []):
            if s.get("type") != "public_transport":
                continue
            dep = s["departure_date_time"]
            arr = s["arrival_date_time"]
            mode = "train" if s.get("display_informations",{}).get("commercial_mode","").lower() in ["ter","tgv","inoui","ice","rail","train"] else "bus"
            legs.append(Leg(
                mode=mode,
                origin=s.get("from",{}).get("name",""),
                destination=s.get("to",{}).get("name",""),
                depart_iso=_navitia_dt(dep),
                arrive_iso=_navitia_dt(arr),
                company=s.get("display_informations",{}).get("network",""),
                number=s.get("display_informations",{}).get("headsign",""),
                duration_min=int(s.get("duration",0)/60)
            ))
        if not legs: 
            continue
        opts.append(Option(
            mode=legs[0].mode,
            price= _guess_price(j),  # Navitia ne fournit pas le prix en standard
            total_duration_min=int(j.get("duration",0)/60),
            transfers=max(0,len(legs)-1),
            legs=legs,
            deeplink=None,
            meta={"provider":"navitia"}
        ))
    return opts

def _navitia_dt(s:str)->str:
    # "20250907T123000" -> ISO
    return f"{s[0:4]}-{s[4:6]}-{s[6:8]}T{s[9:11]}:{s[11:13]}:{s[13:15]}Z"

def _guess_price(j)->float:
    # Estimation naïve : 0.15€/min (MVP). À raffiner.
    return round(max(10,(j.get("duration",0)/60)*0.15),2)