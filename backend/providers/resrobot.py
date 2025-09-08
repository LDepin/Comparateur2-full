import os, httpx
from ..models import Option, Leg

RESROBOT_KEY = os.getenv("RESROBOT_KEY")  # https://www.trafiklab.se/

async def search_resrobot(origin:str, destination:str, date:str):
    if not RESROBOT_KEY:
        return [Option(
            mode="train", price=42.0, total_duration_min=210, transfers=1,
            legs=[Leg(mode="train", origin=origin, destination=destination,
                      depart_iso=f"{date}T08:10:00Z", arrive_iso=f"{date}T11:40:00Z",
                      company="SJ", number="SJ 300", duration_min=210)],
            meta={"provider":"resrobot","fallback":True}
        )]
    # Exemple minimal (journeys V2)
    url = f"https://api.resrobot.se/v2.1/trip?format=json&originId={origin}&destId={destination}&date={date}&accessId={RESROBOT_KEY}"
    async with httpx.AsyncClient(timeout=20.0) as c:
        r = await c.get(url)
        r.raise_for_status()
        data = r.json()
    # Mapping très simplifié
    opts=[]
    for t in data.get("TripList",{}).get("Trip",[]):
        legs=[]
        dur_total=0
        for l in t.get("LegList",{}).get("Leg",[]):
            legs.append(Leg(
                mode="train" if l.get("Product",{}).get("catOutL","").lower().find("train")!=-1 else "bus",
                origin=l.get("Origin",{}).get("name",""),
                destination=l.get("Destination",{}).get("name",""),
                depart_iso=l.get("Origin",{}).get("dateTime",""),
                arrive_iso=l.get("Destination",{}).get("dateTime",""),
                company=l.get("Product",{}).get("operator",""),
                number=l.get("name",""),
                duration_min=int(l.get("duration", "0").replace(":","")[:2] or 0)*60
            ))
        if legs:
            dur_total = sum(L.duration_min for L in legs)
            opts.append(Option(mode=legs[0].mode, price=round(dur_total*0.1,2),
                               total_duration_min=dur_total, transfers=max(0,len(legs)-1),
                               legs=legs, meta={"provider":"resrobot"}))
    return opts