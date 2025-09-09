import httpx
from typing import List
from .base import ProviderBase, FlightResult

ENTUR_ENDPOINT = "https://api.entur.io/journey-planner/v3/graphql"

GQL = """
query($from:String!, $to:String!, $date:String!) {
  trip(
    from: { name: $from }
    to: { name: $to }
    dateTime: $date
    numTripPatterns: 5
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

class Provider(ProviderBase):
    name = "entur"
    async def search(self, origin: str, destination: str, date: str) -> List[FlightResult]:
        try:
            vars = {"from": origin, "to": destination, "date": f"{date}T08:00:00Z"}
            async with httpx.AsyncClient(timeout=20.0, headers={"ET-Client-Name":"comparateur2-app"}) as c:
                r = await c.post(ENTUR_ENDPOINT, json={"query": GQL, "variables": vars})
                r.raise_for_status()
                data = r.json()
            out: List[FlightResult] = []
            patterns = (data.get("data",{}) or {}).get("trip",{}) or {}
            patterns = patterns.get("tripPatterns",[]) or []
            for p in patterns:
                legs = p.get("legs",[]) or []
                if not legs:
                    continue
                dep = legs[0]["aimedStartTime"]
                arr = legs[-1]["aimedEndTime"]
                dur_min = max(1, int(p.get("duration",0)/60))
                escales = max(0, len(legs)-1)
                line = (legs[0].get("line",{}) or {}).get("name") or legs[0].get("mode","PT")
                comp = f"ENTUR/{line}"
                out.append(FlightResult(
                    compagnie=comp,
                    prix=round(dur_min*0.12,2),
                    depart=origin,
                    arrivee=destination,
                    heure_depart=dep[:16],
                    heure_arrivee=arr[:16],
                    duree=f"PT{dur_min//60}H{dur_min%60}M",
                    escales=escales,
                    um_ok=False, animal_ok=False
                ))
            return out
        except Exception:
            return []

provider = Provider()
