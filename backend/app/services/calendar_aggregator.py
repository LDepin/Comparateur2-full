# backend/app/services/calendar_aggregator.py
from __future__ import annotations
from typing import Dict, Any, List, Optional
from datetime import date as dt_date
import logging

from .cache import cache, day_key, cal_key, CACHE_TTL_DAY, CACHE_TTL_CALENDAR
from .normalize import sanitize_price, normalize_flight
from .providers import build_providers  # même logique que /search

log = logging.getLogger(__name__)

# Instanciation (ordre: amadeus puis dummy si configuré ainsi)
_PROVIDERS = build_providers()


def _days_in_month(year: int, month_1to12: int) -> int:
    if month_1to12 == 12:
        return (dt_date(year + 1, 1, 1) - dt_date(year, month_1to12, 1)).days
    return (dt_date(year, month_1to12 + 1, 1) - dt_date(year, month_1to12, 1)).days


def _pad2(n: int) -> str:
    return f"{n:02d}"


def _first_non_empty_day_flights(origin: str, destination: str, date_ymd: str, criteria: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Essaie les providers dans l'ordre jusqu'à obtenir une liste non vide, puis normalise/filtre.
    Résultat trié par prix croissant.
    """
    raw: List[Dict[str, Any]] = []
    for p in _PROVIDERS:
        try:
            got = p.get_day_flights(origin, destination, date_ymd, criteria)  # type: ignore[attr-defined]
        except Exception as e:
            log.warning("Provider %s a échoué (calendar): %s", getattr(p, "name", "?"), e)
            got = []
        if got:
            raw = got
            break

    if not raw:
        return []

    results: List[Dict[str, Any]] = []
    for r in raw:
        f = normalize_flight(r, criteria)
        if f is None:
            continue
        prix_ok = sanitize_price(f.get("prix"))
        if prix_ok is None:
            continue
        f["prix"] = prix_ok
        results.append(f)

    results.sort(key=lambda x: x.get("prix", 10**9))
    return results


def build_month(
    origin: str,
    destination: str,
    month_ym: Optional[str] = None,  # YYYY-MM
    criteria: Optional[Dict[str, Any]] = None,
    **compat_kwargs: Any,
) -> Dict[str, Dict[str, Any]]:
    """
    Construit le calendrier en *itérant sur chaque jour* et en prenant le min issu du provider jour.
    Utilise le cache jour pour éviter la tempête. Aucune valeur synthétique.
    Le contenu mis en cache pour chaque jour est la liste normalisée triée (cohérence /search).

    Compat:
      - accepte month_ym="<YYYY-MM>" (nouveau)
      - accepte month="<YYYY-MM>" (ancien appel) via **compat_kwargs
    """
    if month_ym is None:
        # compat ancienne signature: month=...
        month_ym = compat_kwargs.get("month")
    if not isinstance(month_ym, str) or len(month_ym) != 7 or month_ym[4] != "-":
        raise ValueError("build_month: paramètre 'month_ym' invalide (attendu 'YYYY-MM').")

    if criteria is None:
        criteria = {}

    yy = int(month_ym[:4])
    mm = int(month_ym[5:7])
    nb = _days_in_month(yy, mm)

    out: Dict[str, Dict[str, Any]] = {}

    for d in range(1, nb + 1):
        date_key = f"{yy}-{_pad2(mm)}-{_pad2(d)}"
        dkey = day_key(origin, destination, date_key, criteria)

        flights: Optional[List[Dict[str, Any]]] = cache.get(dkey)
        if flights is None:
            flights = _first_non_empty_day_flights(origin, destination, date_key, criteria)
            cache.set(dkey, flights, CACHE_TTL_DAY)

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