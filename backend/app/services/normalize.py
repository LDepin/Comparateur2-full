# backend/app/services/normalize.py
from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Optional

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


def _parse_iso8601_duration_to_minutes(dur: Any) -> Optional[int]:
    """Parse 'PTxHyM' -> minutes."""
    if not isinstance(dur, str) or not dur.startswith("PT"):
        return None
    total = 0
    num = ""
    seen = False
    for ch in dur[2:]:
        if ch.isdigit():
            num += ch
            continue
        if ch == "H" and num:
            total += int(num) * 60
            num = ""
            seen = True
        elif ch == "M" and num:
            total += int(num)
            num = ""
            seen = True
        else:
            num = ""
    return total if seen else None


def normalize_flight(raw: Dict[str, Any], criteria: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Adapte un vol “brut” (dummy ou provider réel) vers la forme attendue par le front.
    Accepte les 2 formats suivants en entrée :

    - Format "provider réel" (ex. Amadeus):
        price_total, carrier, nb_stops, dep_iso, arr_iso, duration_minutes

    - Format "dummy" existant:
        prix, compagnie, escales, departISO, arriveeISO, duree|duree_minutes
    """
    # Prix
    price = None
    if "price_total" in raw:
        price = sanitize_price(raw.get("price_total"))
    elif "prix" in raw:
        price = sanitize_price(raw.get("prix"))
    if price is None:
        return None

    # Compagnie / escales
    compagnie = raw.get("carrier")
    if not compagnie:
        compagnie = raw.get("compagnie")

    escales = raw.get("nb_stops")
    if escales is None:
        escales = raw.get("escales")

    # ISO départ/arrivée
    dep_iso = raw.get("dep_iso") or raw.get("departISO")
    arr_iso = raw.get("arr_iso") or raw.get("arriveeISO")

    # Durée minutes
    duration_min = raw.get("duration_minutes")
    if duration_min is None:
        if "duree_minutes" in raw:
            try:
                duration_min = int(raw.get("duree_minutes"))
            except Exception:
                duration_min = None
        elif "duree" in raw:
            duration_min = _parse_iso8601_duration_to_minutes(raw.get("duree"))

    # reconstituer une ISO 8601 “PTxHyM” si minutes fournies
    iso_dur = None
    if isinstance(duration_min, int) and duration_min > 0:
        h, m = divmod(int(duration_min), 60)
        iso_dur = f"PT{h}H{m}M"

    # Flags (on les transmet si présents, sinon True par défaut pour rester non-bloquant)
    um_ok = raw.get("um_ok")
    if um_ok is None:
        um_ok = True
    animal_ok = raw.get("animal_ok")
    if animal_ok is None:
        animal_ok = True

    return {
        "prix": price,
        "compagnie": compagnie,
        "escales": escales,
        "um_ok": bool(um_ok),
        "animal_ok": bool(animal_ok),
        "departISO": dep_iso,
        "arriveeISO": arr_iso,
        "duree": iso_dur,              # optionnel
        "duree_minutes": duration_min, # optionnel
    }