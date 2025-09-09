cat > providers/entur.py <<'EOF'
from __future__ import annotations
from typing import List, Dict, Any
from datetime import datetime, timedelta, timezone
import random

from .base import ProviderBase, FlightResult

def _iso(dt: datetime) -> str:
    return dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")

def _fmt_dur(minutes: int) -> str:
    h, m = divmod(minutes, 60)
    return f"PT{h}H{m}M"

class Entur(ProviderBase):
    """
    Fallback Entur (génère des résultats réalistes).
    Quand on branchera l'API Entur réelle, on remplacera ici.
    """
    name = "entur"

    def _rng(self, origin: str, destination: str, key: str) -> random.Random:
        return random.Random(hash((origin, destination, key, "entur")) & 0xFFFFFFFF)

    async def calendar(self, origin: str, destination: str, month: str) -> Dict[str, Dict[str, Any]]:
        y, m = [int(x) for x in month.split("-")]
        # calcul nb jours du mois
        first = datetime(y, m, 1)
        if m == 12:
            nextm = datetime(y + 1, 1, 1)
        else:
            nextm = datetime(y, m + 1, 1)
        days = (nextm - first).days

        r = self._rng(origin, destination, month)
        out: Dict[str, Dict[str, Any]] = {}
        for d in range(1, days + 1):
            price = r.randint(30, 120)
            out[f"{month}-{d:02d}"] = {"prix": price, "disponible": True}
        return out

    async def search(self, origin: str, destination: str, date: str) -> List[FlightResult]:
        r = self._rng(origin, destination, date)
        base = datetime.fromisoformat(date + "T07:00")
        airlines = ["DY", "SK", "WF", "VY", "AF", "KL"]

        res: List[Dict[str, Any]] = []
        for _ in range(5):
            dep = base + timedelta(minutes=r.randint(0, 12) * 35)
            dur = r.randint(80, 210)
            escales = 0 if r.random() < 0.7 else 1
            price = r.randint(35, 180)
            comp = r.choice(airlines)

            res.append(
                FlightResult(
                    compagnie=comp,
                    prix=price,
                    depart=origin,
                    arrivee=destination,
                    heure_depart=_iso(dep),
                    heure_arrivee=_iso(dep + timedelta(minutes=dur)),
                    duree=_fmt_dur(dur),
                    escales=escales,
                    um_ok=True,
                    animal_ok=True,
                ).to_dict()
            )
        return res

provider = Entur()
EOF