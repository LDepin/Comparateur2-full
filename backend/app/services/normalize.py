# backend/app/services/normalize.py
from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Optional, Tuple

# ---------- Criteria ----------

def _parse_csv_ints(s: Any) -> List[int]:
    if not s:
        return []
    if isinstance(s, list):
        out = []
        for v in s:
            try:
                out.append(int(v))
            except Exception:
                pass
        return out
    parts = [p.strip() for p in str(s).split(",") if p.strip()]
    out: List[int] = []
    for p in parts:
        try:
            out.append(int(p))
        except Exception:
            pass
    return out


def normalize_criteria(q: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalise/valide tous les critères supportés par le backend.
    Retourne un dict stable (utilisé pour le hash du cache).
    """
    out: Dict[str, Any] = {}

    def _int(name: str, default: int = 0, minv: int = 0) -> int:
        try:
            v = int(q.get(name, default))
        except Exception:
            v = default
        return max(minv, v)

    out["origin"] = str(q.get("origin", "")).upper()
    out["destination"] = str(q.get("destination", "")).upper()
    if "date" in q:
        out["date"] = str(q.get("date"))
    if "month" in q:
        out["month"] = str(q.get("month"))

    out["adults"] = max(1, _int("adults", 1, 0))

    # CSV d'âges d'enfants
    children_ages = _parse_csv_ints(q.get("childrenAges"))
    out["childrenAges"] = ",".join(str(x) for x in children_ages) if children_ages else ""

    # infants explicite (on ne devine pas)
    out["infants"] = _int("infants", 0, 0)

    # Décompte "children" pour Amadeus (2..11 ans)
    out["children_count_2_11"] = sum(1 for x in children_ages if 2 <= x <= 11)

    # UM / animaux (flags ; pas d’impact pricing Amadeus pour l’instant)
    out["um"] = 1 if str(q.get("um", "0")) in ("1", "true", "True") else 0
    out["umAges"] = str(q.get("umAges", "") or "")
    out["pets"] = 1 if str(q.get("pets", "0")) in ("1", "true", "True") else 0

    # Bagages simplifiés (entiers)
    out["bagsSoute"] = _int("bagsSoute", 0, 0)
    out["bagsCabin"] = _int("bagsCabin", 0, 0)

    # Cabine
    cabin = (q.get("cabin") or "").lower().strip()
    if cabin in ("eco", "economy", "premium", "business", "first", "premium_economy", "premium-economy"):
        out["cabin"] = "premium" if cabin in ("premium_economy", "premium-economy") else cabin
    else:
        out["cabin"] = ""

    # direct / fareType / resident
    out["direct"] = 1 if str(q.get("direct", "0")) in ("1", "true", "True") else 0
    out["fareType"] = str(q.get("fareType", "") or "")
    out["resident"] = 1 if str(q.get("resident", "0")) in ("1", "true", "True") else 0

    # Monnaie (par défaut EUR)
    out["currency"] = (q.get("currency") or "EUR").upper()

    # Champs divers côté front qu’on laisse passer
    if "sort" in q:
        out["sort"] = str(q.get("sort"))

    return out


def criteria_hash(criteria: Dict[str, Any]) -> str:
    """Hash stable (sha1) sur JSON trié."""
    blob = json.dumps(criteria, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha1(blob).hexdigest()


# ---------- Flight normalization ----------

def sanitize_price(p: Any) -> Optional[int]:
    try:
        f = float(p)
        if f <= 0 or f != f:  # <=0 or NaN
            return None
        # arrondi au plus proche €
        return int(round(f))
    except Exception:
        return None


def _first_not_none(*vals: Any) -> Any:
    for v in vals:
        if v is not None:
            return v
    return None


def normalize_flight(raw: Dict[str, Any], criteria: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Adapte un vol “brut” (dummy ou provider réel) vers la forme attendue par le front.
    Champs acceptés en entrée (compat amadeus + dummy) :
      - price_total | prix
      - carrier | compagnie
      - nb_stops | escales
      - dep_iso | departISO
      - arr_iso | arriveeISO
      - duration_minutes | duree_minutes

    Retour:
      {
        "prix": int,
        "compagnie": str|None,
        "escales": int|None,
        "um_ok": bool,
        "animal_ok": bool,
        "departISO": str|None,
        "arriveeISO": str|None,
        "duree": "PTxHyM" (optionnel),
        "duree_minutes": int (optionnel)
      }
    """
    # Prix
    price = None
    if "price_total" in raw:
        price = sanitize_price(raw.get("price_total"))
    elif "prix" in raw:
        price = sanitize_price(raw.get("prix"))
    if price is None:
        return None

    # Champs avec tolérance de noms (amadeus vs dummy)
    carrier = _first_not_none(raw.get("carrier"), raw.get("compagnie"))
    nb_stops = _first_not_none(raw.get("nb_stops"), raw.get("escales"))
    dep_iso = _first_not_none(raw.get("dep_iso"), raw.get("departISO"))
    arr_iso = _first_not_none(raw.get("arr_iso"), raw.get("arriveeISO"))
    duration_min = _first_not_none(raw.get("duration_minutes"), raw.get("duree_minutes"))

    # Reconstituer une durée ISO 8601 si minutes fournies
    iso_dur = None
    if isinstance(duration_min, int) and duration_min > 0:
        h, m = divmod(int(duration_min), 60)
        iso_dur = f"PT{h}H{m}M"

    # Propager les flags demandés (UM/pets) – pas d’impact prix si non supporté provider
    um_ok = True if int(criteria.get("um", 0)) == 1 else True
    animal_ok = True if int(criteria.get("pets", 0)) == 1 else True

    return {
        "prix": price,
        "compagnie": carrier,
        "escales": nb_stops,
        "um_ok": um_ok,
        "animal_ok": animal_ok,
        "departISO": dep_iso,
        "arriveeISO": arr_iso,
        "duree": iso_dur,                    # optionnel
        "duree_minutes": duration_min,       # optionnel
    }