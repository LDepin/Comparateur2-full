# backend/providers/amadeus.py
from __future__ import annotations

import os
import time
import logging
from typing import Any, Dict, List, Optional, Tuple

import requests

logger = logging.getLogger("amadeus")

# ====== Config & OAuth ======

_AMADEUS_ENV = (os.getenv("AMADEUS_ENV") or "sandbox").lower().strip()
_BASE_URL = "https://api.amadeus.com" if _AMADEUS_ENV.startswith("prod") else "https://test.api.amadeus.com"

_CLIENT_ID = os.getenv("AMADEUS_CLIENT_ID") or ""
_CLIENT_SECRET = os.getenv("AMADEUS_CLIENT_SECRET") or ""

# Cache token mémoire (process)
_token_cache: Dict[str, Any] = {
    "access_token": None,
    "expires_at": 0.0,  # epoch seconds
}
_TOKEN_TTL_FALLBACK = 20 * 60  # 20 minutes si la réponse ne précise pas


def _now() -> float:
    return time.time()


def _get_access_token() -> Optional[str]:
    """Récupère un token OAuth2 client_credentials, avec cache mémoire."""
    # Pas de clés → provider désactivé
    if not _CLIENT_ID or not _CLIENT_SECRET:
        logger.info("amadeus: client_id/secret manquants → provider inactif")
        return None

    # Token encore valide ?
    if _token_cache.get("access_token") and _now() < float(_token_cache.get("expires_at", 0)):
        return _token_cache["access_token"]

    try:
        resp = requests.post(
            f"{_BASE_URL}/v1/security/oauth2/token",
            data={
                "grant_type": "client_credentials",
                "client_id": _CLIENT_ID,
                "client_secret": _CLIENT_SECRET,
            },
            timeout=10,
        )
        if resp.status_code != 200:
            logger.warning("amadeus: échec token (%s) %s", resp.status_code, resp.text[:300])
            return None
        data = resp.json()
        token = data.get("access_token")
        expires_in = int(data.get("expires_in") or _TOKEN_TTL_FALLBACK)
        _token_cache["access_token"] = token
        _token_cache["expires_at"] = _now() + max(60, min(expires_in, 3600 * 2))  # 1h–2h
        return token
    except Exception as e:
        logger.warning("amadeus: exception token: %s", e)
        return None


# ====== Utils parsing ======

def _iso_from_segment(seg: Dict[str, Any], key: str) -> Optional[str]:
    # seg["departure"]["at"] / seg["arrival"]["at"] → "2025-09-06T07:25:00"
    try:
        return seg[key]["at"] + "Z" if seg.get(key, {}).get("at") else None
    except Exception:
        return None


def _parse_duration_iso8601(dur: Optional[str]) -> Optional[int]:
    # ex: "PT2H30M" → minutes
    if not dur or not dur.startswith("PT"):
        return None
    total = 0
    num = ""
    has_any = False
    for ch in dur[2:]:
        if ch.isdigit():
            num += ch
            continue
        if ch == "H" and num:
            total += int(num) * 60
            num = ""
            has_any = True
        elif ch == "M" and num:
            total += int(num)
            num = ""
            has_any = True
        else:
            # ignorer S etc.
            num = ""
    return total if has_any else None


def _map_cabin_to_travel_class(cabin: Optional[str]) -> Optional[str]:
    if not cabin:
        return None
    c = cabin.lower().strip()
    if c == "eco" or c == "economy":
        return "ECONOMY"
    if c in ("premium", "premium_economy", "premium-economy"):
        return "PREMIUM_ECONOMY"
    if c == "business":
        return "BUSINESS"
    if c == "first":
        return "FIRST"
    return None


# ====== Public API ======

def get_day_flights(origin: str, destination: str, date: str, criteria: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Appelle Amadeus Flight Offers Search v2 pour un aller simple.
    Retourne une liste de FlightRaw minimaliste, prête pour normalize_flight().
    Si pas de clés ou erreur → [] (le caller fera fallback dummy).
    """
    token = _get_access_token()
    if not token:
        return []

    adults = int(criteria.get("adults") or 1)
    # childrenAges → compter ages in [2..11]
    children_ages = _parse_csv_ints(criteria.get("childrenAges"))
    children = sum(1 for x in children_ages if 2 <= x <= 11)
    infants = int(criteria.get("infants") or 0)
    direct = bool(int(criteria.get("direct") or 0))
    cabin = _map_cabin_to_travel_class(criteria.get("cabin"))
    currency = (criteria.get("currency") or "EUR").upper()

    payload: Dict[str, Any] = {
        "originLocationCode": origin.upper(),
        "destinationLocationCode": destination.upper(),
        "departureDate": date,  # YYYY-MM-DD
        "adults": max(0, adults),
        "children": max(0, children),
        "infants": max(0, infants),
        "currencyCode": currency,
        "oneWay": True,
        "max": 50,
    }
    if direct:
        payload["nonStop"] = True
    if cabin:
        payload["travelClass"] = cabin

    url = f"{_BASE_URL}/v2/shopping/flight-offers"
    t0 = time.time()
    try:
        # La version GET accepte les mêmes paramètres simples
        resp = requests.get(url, headers={"Authorization": f"Bearer {token}"}, params=payload, timeout=15)
        elapsed = (time.time() - t0) * 1000
        if resp.status_code != 200:
            logger.warning("amadeus: %s → HTTP %s (%d ms) %s", url, resp.status_code, int(elapsed), resp.text[:240])
            return []
        data = resp.json() or {}
        offers = data.get("data") or []
        results: List[Dict[str, Any]] = []

        for off in offers:
            # Prix
            price = _safe_float((off.get("price") or {}).get("grandTotal"))
            if not price or price <= 0:
                continue

            itineraries = off.get("itineraries") or []
            if not itineraries:
                continue
            it0 = itineraries[0]
            segs = it0.get("segments") or []
            if not segs:
                continue

            dep_iso = _iso_from_segment(segs[0], "departure")
            arr_iso = _iso_from_segment(segs[-1], "arrival")
            duration_min = _parse_duration_iso8601(it0.get("duration"))
            nb_stops = max(0, len(segs) - 1)

            # compagnie: marketingCarrierCode si présent, sinon carrierCode du 1er seg
            carrier = (
                segs[0].get("marketingCarrierCode")
                or segs[0].get("carrierCode")
                or (off.get("validatingAirlineCodes") or [None])[0]
            )

            if not dep_iso or not arr_iso or not duration_min:
                continue

            results.append(
                {
                    "price_total": float(price),
                    "carrier": carrier,
                    "nb_stops": nb_stops,
                    "dep_iso": dep_iso,
                    "arr_iso": arr_iso,
                    "duration_minutes": duration_min,
                }
            )

        if results:
            try:
                min_price = min(r["price_total"] for r in results)
            except Exception:
                min_price = None
        else:
            min_price = None

        logger.info(
            "amadeus day OK: %s-%s %s adult=%s child=%s infant=%s direct=%s cabin=%s → %d offres (min=%s) in %d ms",
            origin,
            destination,
            date,
            adults,
            children,
            infants,
            int(direct),
            cabin or "-",
            len(results),
            f"{min_price:.0f}" if isinstance(min_price, (int, float)) else "n/a",
            int(elapsed),
        )

        return results

    except Exception as e:
        logger.warning("amadeus: exception GET %s → %s", url, e)
        return []


# ====== Small helpers ======

def _parse_csv_ints(s: Any) -> List[int]:
    if not s:
        return []
    if isinstance(s, list):
        return [int(x) for x in s if _is_int_like(x)]
    txt = str(s)
    parts = [p.strip() for p in txt.split(",") if p.strip()]
    out: List[int] = []
    for p in parts:
        try:
            out.append(int(p))
        except Exception:
            pass
    return out


def _is_int_like(x: Any) -> bool:
    try:
        int(x)
        return True
    except Exception:
        return False


def _safe_float(x: Any) -> Optional[float]:
    try:
        f = float(x)
        if f != f:  # NaN
            return None
        return f
    except Exception:
        return None


# ==== Classe attendue par le loader ====

class AmadeusProvider:
    """
    Fin adaptateur OO pour coller à l’interface du loader.
    """
    name = "amadeus"

    def get_day_flights(self, origin: str, destination: str, date: str, criteria: Dict[str, Any]) -> List[Dict[str, Any]]:
        return get_day_flights(origin, destination, date, criteria)