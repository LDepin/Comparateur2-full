import os, httpx
from typing import List, Any, Dict
from .base import ProviderBase, FlightResult

BASE = "https://api.resrobot.se/v2.1"

def _pick_stop(obj: Dict[str, Any]):
    if "LocationList" in obj:
        lst = obj["LocationList"].get("StopLocation") or []
    else:
        lst = obj.get("StopLocation") or []
    if isinstance(lst, dict):
        lst = [lst]
    for s in lst:
        ext = s.get("extId") or s.get("id")
        if ext:
            return ext
    return None

def _parse_dur_to_min(d: str) -> int:
    if not d: return 0
    parts = d.split(":")
    try:
        if len(parts) == 3:
            h, m, _ = parts
        elif len(parts) == 2:
            h, m = parts
        else:
            return 0
        return int(h) * 60 + int(m)
    except Exception:
        return 0

class Provider(ProviderBase):
    name = "resrobot"

    async def search(self, origin: str, destination: str, date: str) -> List[FlightResult]:
        key = os.getenv("RESROBOT_KEY")
        if not key:
            return []

        async with httpx.AsyncClient(timeout=20.0) as c:
            r1 = await c.get(f"{BASE}/location.name", params={"input": origin, "format":"json", "accessId": key})
            r1.raise_for_status()
            o_id = _pick_stop(r1.json())

            r2 = await c.get(f"{BASE}/location.name", params={"input": destination, "format":"json", "accessId": key})
            r2.raise_for_status()
            d_id = _pick_stop(r2.json())

            if not o_id or not d_id:
                return []

            params = {
                "originId": o_id, "destId": d_id,
                "date": date, "time": "08:00",
                "format": "json", "accessId": key,
                "numF": 5
            }
            r3 = await c.get(f"{BASE}/trip", params=params)
            r3.raise_for_status()
            data = r3.json()

        trips = data.get("Trip") or []
        if isinstance(trips, dict):
            trips = [trips]

        out: List[FlightResult] = []
        for t in trips:
            dur_min = _parse_dur_to_min(t.get("dur", ""))
            leglist = t.get("LegList", {})
            legs = leglist.get("Leg") or []
            if isinstance(legs, dict):
                legs = [legs]
            if not legs:
                continue

            first = legs[0]
            last = legs[-1]

            def _iso(blk, tag):
                b = blk.get(tag) or {}
                dt = f"{b.get('date','')}T{(b.get('time','')[:5])}"
                return dt

            dep_iso = _iso(first, "Origin")
            arr_iso = _iso(last, "Destination")

            line = first.get("name") or (first.get("Product") or {}).get("name") or first.get("type") or "PT"
            comp = f"RESROBOT/{line}"

            out.append(FlightResult(
                compagnie=comp,
                prix=round(max(1, dur_min)*0.11, 2),
                depart=origin,
                arrivee=destination,
                heure_depart=dep_iso[:16],
                heure_arrivee=arr_iso[:16],
                duree=f"PT{dur_min//60}H{dur_min%60}M" if dur_min>0 else "PT0H0M",
                escales=max(0, len(legs)-1),
                um_ok=False,
                animal_ok=False
            ))
        return out

provider = Provider()
