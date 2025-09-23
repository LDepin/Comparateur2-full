# backend/app/services/calendar_aggregator.py
from __future__ import annotations
from typing import Dict, Any, List, Optional
from datetime import date as dt_date
import logging

from .cache import cache, day_key, cal_key, CACHE_TTL_DAY, CACHE_TTL_CALENDAR
from .normalize import sanitize_price, normalize_flight
from .providers import build_providers  # charge selon PROVIDERS=...

log = logging.getLogger(__name__)


def _days_in_month(year: int, month_1to12: int) -> int:
    if month_1to12 == 12:
        return (dt_date(year + 1, 1, 1) - dt_date(year, month_1to12, 1)).days
    return (dt_date(year, month_1to12 + 1, 1) - dt_date(year, month_1to12, 1)).days


def _pad2(n: int) -> str:
    return f"{n:02d}"


def _get_day_flights_with_fallback(
    origin: str,
    destination: str,
    date_ymd: str,
    criteria: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Essaie les providers dans l'ordre défini par PROVIDERS.
    Tolérance d'erreurs : on log et on continue. Retour [] si rien.
    """
    providers = build_providers()
    for p in providers:
        try:
            rows = p.get_day_flights(origin, destination, date_ymd, criteria) or []
            if rows:
                log.info("calendar: provider=%s day=%s %s-%s → %d offres", p.name, date_ymd, origin, destination, len(rows))
                return rows
            else:
                log.info("calendar: provider=%s day=%s %s-%s → 0 offre", p.name, date_ymd, origin, destination)
        except Exception as e:
            log.warning("calendar: provider=%s exception day=%s %s-%s → %s", p.name, date_ymd, origin, destination, e)
            continue
    return []


def build_month(
    origin: str,
    destination: str,
    month_ym: str,  # YYYY-MM  (conforme à l'appelant)
    criteria: Dict[str, Any],
) -> Dict[str, Dict[str, Any]]:
    """
    Construit le calendrier en *itérant sur chaque jour* et en prenant le min des vols du jour
    (providers dans l'ordre, avec fallback). Utilise le cache DAY et compose le cache CAL.
    """
    yy = int(month_ym[:4])
    mm = int(month_ym[5:7])
    nb = _days_in_month(yy, mm)

    out: Dict[str, Dict[str, Any]] = {}

    for d in range(1, nb + 1):
        date_key = f"{yy}-{_pad2(mm)}-{_pad2(d)}"
        dkey = day_key(origin, destination, date_key, criteria)

        flights: Optional[List[Dict[str, Any]]] = cache.get(dkey)
        if flights is None:
            # Fetch + normalisation + filtrage prix valides
            raw_list = _get_day_flights_with_fallback(origin, destination, date_key, criteria)
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

    ckey = cal_key(origin, destination, month_ym, criteria)
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