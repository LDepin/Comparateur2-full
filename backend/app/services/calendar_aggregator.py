# backend/app/services/calendar_aggregator.py
from __future__ import annotations
from typing import Dict, Any, List, Optional
from datetime import date as dt_date
import logging

from .cache import cache, day_key, cal_key, CACHE_TTL_DAY, CACHE_TTL_CALENDAR
from .normalize import sanitize_price, normalize_flight

log = logging.getLogger(__name__)

def _days_in_month(year: int, month_1to12: int) -> int:
    if month_1to12 == 12:
        return (dt_date(year + 1, 1, 1) - dt_date(year, month_1to12, 1)).days
    return (dt_date(year, month_1to12 + 1, 1) - dt_date(year, month_1to12, 1)).days

def _pad2(n: int) -> str:
    return f"{n:02d}"

def build_month(
    origin: str,
    destination: str,
    month: str,  # YYYY-MM
    criteria: Dict[str, Any],
    provider,
) -> Dict[str, Dict[str, Any]]:
    """
    Construit le calendrier en *itérant sur chaque jour* et en prenant le min de /search (provider jour).
    Utilise le cache jour pour éviter la tempête. Aucune valeur synthétique.
    """
    yy = int(month[:4])
    mm = int(month[5:7])
    nb = _days_in_month(yy, mm)

    out: Dict[str, Dict[str, Any]] = {}

    for d in range(1, nb + 1):
        date_key = f"{yy}-{_pad2(mm)}-{_pad2(d)}"
        dkey = day_key(origin, destination, date_key, criteria)

        flights: Optional[List[Dict[str, Any]]] = cache.get(dkey)
        if flights is None:
            raw_list = provider.get_day_flights(origin, destination, date_key, criteria)
            normalized = [normalize_flight(r, criteria) for r in raw_list]
            normalized = [f for f in normalized if sanitize_price(f.get("prix")) is not None]
            cache.set(dkey, normalized, CACHE_TTL_DAY)
            flights = normalized

        prices = [sanitize_price(f.get("prix")) for f in flights]
        prices = [p for p in prices if p is not None]
        min_price = min(prices) if prices else None

        out[date_key] = {
            "prix": min_price,
            "disponible": bool(prices),
        }

    ckey = cal_key(origin, destination, month, criteria)
    cache.set(ckey, out, CACHE_TTL_CALENDAR)
    return out

def update_month_cache_min_if_present(
    origin: str,
    destination: str,
    date: str,      # YYYY-MM-DD
    criteria: Dict[str, Any],
    new_min: Optional[int],
) -> None:
    month = date[:7]
    ckey = cal_key(origin, destination, month, criteria)
    cal = cache.get(ckey)
    if not isinstance(cal, dict):
        return
    day = cal.get(date) or {}
    old = day.get("prix")
    if new_min != old:
        cal[date] = {"prix": new_min, "disponible": bool(new_min)}
        cache.set(ckey, cal, CACHE_TTL_CALENDAR)
        log.info("[calendar] CAL cache updated for %s (old=%s, new=%s)", date, old, new_min)