# backend/app/services/providers.py
from __future__ import annotations

import math
import os
from typing import Any, Dict, List, Optional, Tuple


Criteria = Dict[str, Any]

# ---------- Interface attendue par l’agrégateur ----------

class Provider:
    """
    Interface adapter générique sur une source de vols.
    """

    name: str = "provider"

    def get_month_mins(
        self, origin: str, destination: str, year: int, month_1to12: int, criteria: Criteria
    ) -> Optional[Dict[str, Optional[int]]]:
        """
        Optionnel. Renvoie un dict { 'YYYY-MM-DD': minPrix|None }.
        Retourne None si l’API n'expose pas de "mois".
        """
        return None

    def get_day_flights(
        self, origin: str, destination: str, date_ymd: str, criteria: Criteria
    ) -> List[Dict[str, Any]]:
        """
        Obligatoire. Liste des vols du jour (déjà pricés selon critères).
        """
        raise NotImplementedError


# ---------- DummyProvider déterministe (pour dev/local) ----------

def _pad2(n: int) -> str:
    return f"{n:02d}"

def _seed_month(origin: str, destination: str, y: int, m: int, criteria: Criteria) -> int:
    flags = (
        (1 if criteria.get("direct") else 0) * 101
        + (1 if criteria.get("um") else 0) * 73
        + (1 if criteria.get("pets") else 0) * 59
        + (1 if (criteria.get("cabin") or "eco") == "business" else 0) * 17
    )
    return y * 10000 + m * 100 + ord(origin[:1].upper()) * 13 + ord(destination[:1].upper()) * 17 + flags

def _seed_day(date_ymd: str, origin: str, destination: str, criteria: Criteria) -> int:
    ymd = int(date_ymd.replace("-", ""))
    return ymd + ord(origin[:1].upper()) * 13 + ord(destination[:1].upper()) * 19 + (
        (1 if criteria.get("direct") else 0) * 101
        + (1 if criteria.get("um") else 0) * 73
        + (1 if criteria.get("pets") else 0) * 59
    )

def _rnd(seed: int, i: int) -> float:
    x = math.sin(seed + i * 37) * 10000.0
    return x - int(x)


class DummyProvider(Provider):
    name = "dummy"

    def get_month_mins(
        self, origin: str, destination: str, year: int, month_1to12: int, criteria: Criteria
    ) -> Optional[Dict[str, Optional[int]]]:
        seed = _seed_month(origin, destination, year, month_1to12, criteria)
        # NB: on ne met pas de "random" non déterministe ; c’est stable pour un jeu de critères donné
        from datetime import date

        # nb jours du mois
        if month_1to12 == 12:
            nb = (date(year + 1, 1, 1) - date(year, month_1to12, 1)).days
        else:
            nb = (date(year, month_1to12 + 1, 1) - date(year, month_1to12, 1)).days

        out: Dict[str, Optional[int]] = {}
        for d in range(1, nb + 1):
            r = _rnd(seed, d)
            available = r > 0.15  # ~85% des jours ont au moins un vol
            price = None
            if available:
                base = 40 + int(_rnd(seed, d + 1) * 200)  # 40..240
                if criteria.get("direct"):
                    base += 8
                if criteria.get("um"):
                    base += 5
                if criteria.get("pets"):
                    base += 5
                price = max(1, base)
            key = f"{year}-{_pad2(month_1to12)}-{_pad2(d)}"
            out[key] = price
        return out

    def get_day_flights(
        self, origin: str, destination: str, date_ymd: str, criteria: Criteria
    ) -> List[Dict[str, Any]]:
        seed = _seed_day(date_ymd, origin, destination, criteria)
        company_pool = ["AF", "VY", "U2", "IB", "TO", "HV", "V7"]

        count = 6 + int(_rnd(seed, 1) * 6)  # 6..11 vols
        flights: List[Dict[str, Any]] = []
        for i in range(count):
            base = 40 + int(_rnd(seed, 10 + i) * 200)
            prix = base + (8 if criteria.get("direct") else 0) + (5 if criteria.get("um") else 0) + (5 if criteria.get("pets") else 0)
            escales = 0 if criteria.get("direct") else (0 if _rnd(seed, 20 + i) < 0.6 else 1)

            hour = 6 + int(_rnd(seed, 30 + i) * 14)        # 06..20
            minute = int(_rnd(seed, 40 + i) * 60)
            duree_min = 60 + int(_rnd(seed, 50 + i) * 240) # 1h..5h

            arr_h = (hour + (duree_min // 60)) % 24
            arr_m = (minute + (duree_min % 60)) % 60

            compagnie = company_pool[int(_rnd(seed, 60 + i) * len(company_pool))]
            flights.append({
                "prix": prix,
                "compagnie": compagnie,
                "escales": escales,
                "um_ok": True,
                "animal_ok": True,
                "departISO": f"{date_ymd}T{_pad2(hour)}:{_pad2(minute)}:00.000Z",
                "arriveeISO": f"{date_ymd}T{_pad2(arr_h)}:{_pad2(arr_m)}:00.000Z",
                "duree": f"PT{duree_min // 60}H{duree_min % 60}M",
                "duree_minutes": duree_min,
            })
        return flights


# ---------- Référencement/instanciation des providers ----------

def build_providers() -> List[Provider]:
    """
    Lecture de la variable d'env PROVIDERS (CSV), ex: "dummy".
    En prod, tu pourras brancher des adapters réels ici.
    """
    names = [s.strip().lower() for s in os.getenv("PROVIDERS", "dummy").split(",") if s.strip()]
    out: List[Provider] = []
    for n in names:
        if n == "dummy":
            out.append(DummyProvider())
        # elif n == "navitia": out.append(NavitiaProvider(...))
        # elif n == "ptx_tw": out.append(PTXTaiwanProvider(...))
    return out