import httpx
from ..models import Option, Leg

ENTUR_ENDPOINT = "https://api.entur.io/journey-planner/v3/graphql"

GQL = """
query($from:String!, $to:String!, $date:String!) {
  trip(
    from: { name: $from }
    to: { name: $to }
    dateTime: $date
    numTripPatterns: 3
  ) {
    tripPatterns {
      duration
      legs {
        mode
        aimedStartTime
        aimedEndTime
        fromPlace { name }
        toPlace { name }
        line { name }
      }
    }
  }
}
"""

async def search_entur(origin:str, destination:str, date:str):
    # Retour fallback si l’API est non joignable (clé non nécessaire chez Entur)
    try:
        async with httpx.AsyncClient(timeout=20.0, headers={"ET-Client-Name":"comparateur2-app"}) as c:
            r = await c.post(ENTUR_ENDPOINT, json={"query":GQL,"variables":{"from":origin,"to":destination,"date":f"{date}T08:00:00Z"}})
            r.raise_for_status()
            data = r.json()
        opts=[]
        for p in (data.get("data",{}).get("trip",{}) or {}).get("tripPatterns",[]):
            legs=[]
            for L in p.get("legs",[]):
                legs.append(Leg(
                    mode="train" if L["mode"]=="RAIL" else "bus",
                    origin=L["fromPlace"]["name"],
                    destination=L["toPlace"]["name"],
                    depart_iso=L["aimedStartTime"],
                    arrive_iso=L["aimedEndTime"],
                    company=L.get("line",{}).get("name",""),
                    duration_min=int(p.get("duration",0)/60)
                ))
            if legs:
                opts.append(Option(
                    mode=legs[0].mode, price=round(p["duration"]/60*0.12,2),
                    total_duration_min=int(p["duration"]/60),
                    transfers=max(0,len(legs)-1), legs=legs, meta={"provider":"entur"}
                ))
        return opts or _fallback(origin,destination,date)
    except Exception:
        return _fallback(origin,destination,date)

def _fallback(o,d,date):
    return [Option(
        mode="train", price=49.0, total_duration_min=180, transfers=1,
        legs=[Leg(mode="train", origin=o, destination=d,
                  depart_iso=f"{date}T07:45:00Z", arrive_iso=f"{date}T10:45:00Z",
                  company="Vy", number=None, duration_min=180)],
        meta={"provider":"entur","fallback":True}
    )]