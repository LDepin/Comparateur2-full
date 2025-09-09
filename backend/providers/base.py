from __future__ import annotations
from dataclasses import dataclass, asdict
from typing import List, Dict, Any

@dataclass
class FlightResult:
    compagnie: str
    prix: float
    depart: str
    arrivee: str
    heure_depart: str
    heure_arrivee: str
    duree: str
    escales: int
    um_ok: bool
    animal_ok: bool
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

class ProviderBase:
    name: str = "base"
    async def calendar(self, origin: str, destination: str, month: str) -> Dict[str, Dict[str, Any]]:
        return {}
    async def search(self, origin: str, destination: str, date: str) -> List[FlightResult]:
        return []
