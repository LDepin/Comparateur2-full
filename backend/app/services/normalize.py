# backend/app/services/normalize.py
from __future__ import annotations
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta

def _to_int(v: Any, default: int = 0) -> int:
    try:
        return int(v)
    except Exception:
        return default

def _to_bool01(v: Any) -> int:
    if v in (True, "true", "True", "1", 1, "on", "yes", "y"):
        return 1
    return 0

def _csv_ints(s: Optional[str]) -> List[int]:
    if not s:
        return []
    parts = [p.strip() for p in str(s).split(",") if p.strip() != ""]
    out: List[int] = []
    for p in parts:
        try:
            out.append(int(p))
        except Exception:
            continue
    return out

def normalize_criteria(q: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalise *tous* les critères (types primitifs). Compatible avec GET params FastAPI.
    """
    return {
        "adults": max(0, _to_int(q.get("adults", 1), 1)),
        "childrenAges": _csv_ints(q.get("childrenAges")),
        "infants": max(0, _to_int(q.get("infants", 0), 0)),
        "um": _to_bool01(q.get("um", 0)),
        "umAges": _csv_ints(q.get("umAges")),
        "pets": _to_bool01(q.get("pets", 0)),
        "bagsSoute": max(0, _to_int(q.get("bagsSoute", 0), 0)),
        "bagsCabin": max(0, _to_int(q.get("bagsCabin", 0), 0)),
        "cabin": str(q.get("cabin", "eco")).lower(),
        "direct": _to_bool01(q.get("direct", 0)),
        "fareType": str(q.get("fareType", "") or ""),
        "resident": _to_bool01(q.get("resident", 0)),
    }

def sanitize_price(p: Any) -> Optional[int]:
    """
    Arrondi à l'euro, enlève valeurs <=0 / NaN.
    """
    try:
        f = float(p)
        i = int(round(f))
        if i > 0:
            return i
        return None
    except Exception:
        return None

def _pad2(n: int) -> str:
    return f"{n:02d}"

def _iso_from_date_time(date: str, hour: int, minute: int) -> str:
    # Construit une ISO *UTC* simple (Z), le front ne dépend pas du fuseau ici.
    return f"{date}T{_pad2(hour)}:{_pad2(minute)}:00.000Z"

def normalize_flight(raw: Dict[str, Any], criteria: Dict[str, Any]) -> Dict[str, Any]:
    """
    Rend un vol conforme au front. Les champs manquants sont inférés de façon *déterministe*,
    jamais aléatoire.
    """
    prix = sanitize_price(raw.get("prix"))
    escales = raw.get("escales")
    try:
        escales = int(escales) if escales is not None else None
    except Exception:
        escales = None

    dep_iso = raw.get("departISO") or raw.get("depart_iso")
    arr_iso = raw.get("arriveeISO") or raw.get("arrivee_iso")

    # Fallback déterministe si heures absentes mais "date" + "departHM"/"arriveHM" présents
    if (not dep_iso or not arr_iso) and raw.get("date") and raw.get("departHM") and raw.get("arriveHM"):
        dh, dm = map(int, str(raw["departHM"]).split(":"))
        ah, am = map(int, str(raw["arriveHM"]).split(":"))
        dep_iso = _iso_from_date_time(str(raw["date"]), dh, dm)
        arr_iso = _iso_from_date_time(str(raw["date"]), ah, am)

    duree_min: Optional[int] = None
    if raw.get("duree_minutes") is not None:
        try:
            duree_min = int(raw["duree_minutes"])
        except Exception:
            duree_min = None
    elif dep_iso and arr_iso:
        try:
            d1 = datetime.fromisoformat(dep_iso.replace("Z", "+00:00"))
            d2 = datetime.fromisoformat(arr_iso.replace("Z", "+00:00"))
            delta = d2 - d1
            duree_min = max(1, int(delta.total_seconds() // 60))
        except Exception:
            duree_min = None

    out = {
        "prix": prix if prix is not None else 0,  # sera filtré ensuite si 0
        "compagnie": raw.get("compagnie"),
        "escales": escales,
        "um_ok": bool(raw.get("um_ok", True)),
        "animal_ok": bool(raw.get("animal_ok", True)),
        "departISO": dep_iso,
        "arriveeISO": arr_iso,
        # On expose soit "duree" au format PT, soit "duree_minutes"
        "duree": raw.get("duree"),
        "duree_minutes": duree_min,
    }
    return out