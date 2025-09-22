# backend/providers/dummy.py
"""
Provider *jour uniquement* (aucune API "mois").
Les vols sont générés de manière *déterministe* à partir d'un hash (pas de random),
puis *pricés* en appliquant les critères. Le même moteur sert /calendar (via agrégation jour)
et /search → cohérence garantie.
"""
from __future__ import annotations
from typing import Any, Dict, List
import hashlib

def _hash_int(*parts: str) -> int:
    base = "|".join(parts).encode("utf-8")
    h = hashlib.sha1(base).hexdigest()
    # grand entier
    return int(h[:16], 16)

def _lcg(n: int) -> int:
    # LCG déterministe, 64-bit
    return (1103515245 * n + 12345) & 0x7FFFFFFFFFFFFFFF

def _lcg_float01(n: int) -> float:
    return (_lcg(n) % 10_000_000) / 10_000_000.0

def _criteria_multiplier(criteria: Dict[str, Any]) -> float:
    """
    Ajuste le prix selon les critères (déterministe).
    """
    m = 1.0
    # Cabine
    cabin = (criteria.get("cabin") or "eco").lower()
    if cabin == "premium":
        m *= 1.25
    elif cabin == "business":
        m *= 1.8
    elif cabin == "first":
        m *= 2.4

    # Bagages
    m *= 1.0 + 0.12 * max(0, int(criteria.get("bagsSoute", 0)))
    m *= 1.0 + 0.05 * max(0, int(criteria.get("bagsCabin", 0)))

    # UM / animaux
    if int(criteria.get("um", 0)) == 1:
        m *= 1.08
    if int(criteria.get("pets", 0)) == 1:
        m *= 1.05

    # Direct : prix souvent un peu plus haut, mais escales = 0
    if int(criteria.get("direct", 0)) == 1:
        m *= 1.07

    # Réductions enfants/infants (grossières mais déterministes)
    children = list(criteria.get("childrenAges") or [])
    infants = int(criteria.get("infants", 0))
    if children:
        # -15% par enfant (capé)
        m *= max(0.6, 1.0 - 0.15 * len(children))
    if infants:
        # -90% pour les infants (faible coût additionnel)
        m *= max(0.5, 1.0 - 0.45 * infants)

    # Resident
    if int(criteria.get("resident", 0)) == 1:
        m *= 0.85

    # Fare type (ex: basic < standard < flex)
    fare = (criteria.get("fareType") or "").lower()
    if fare == "basic":
        m *= 0.95
    elif fare == "flex":
        m *= 1.15

    return m

def _base_price(seed: int) -> float:
    # prix de base "route/date" (entre ~30 et ~240)
    return 30.0 + 210.0 * _lcg_float01(seed)

def _hour(seed: int, offset: int) -> int:
    # heure de départ (6..21)
    return 6 + int(_lcg_float01(seed + 1000 + offset) * 16)

def _minute(seed: int, offset: int) -> int:
    return int(_lcg_float01(seed + 2000 + offset) * 60)

def _duration_min(seed: int, offset: int) -> int:
    # 50..320 min
    return 50 + int(_lcg_float01(seed + 3000 + offset) * 270)

def _pad2(n: int) -> str:
    return f"{n:02d}"

def _iso(date: str, h: int, m: int) -> str:
    return f"{date}T{_pad2(h)}:{_pad2(m)}:00.000Z"

COMPANIES = ["AF", "VY", "U2", "IB", "TO", "HV", "V7", "TO", "HV"]

def get_day_flights(origin: str, destination: str, date: str, criteria: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Retourne une liste de vols *bruts* (pour normalisation ensuite).
    Déterministe : même (O,D,date,criteria) -> mêmes vols/prix.
    """
    crit_items = sorted((str(k), str(v)) for k, v in (criteria or {}).items())
    crit_str = "&".join([f"{k}={v}" for k, v in crit_items])
    seed = _hash_int(origin.upper(), destination.upper(), date, crit_str)

    # Nombre de vols "naturels" pour ce jour (de 5 à 10), déterministe
    n_flights = 5 + int(_lcg_float01(seed + 7) * 6)

    out: List[Dict[str, Any]] = []
    price_mul = _criteria_multiplier(criteria)

    for i in range(n_flights):
        s = seed + i * 97
        dep_h = _hour(s, i)
        dep_m = _minute(s, i)
        dmin = _duration_min(s, i)
        arr_h = (dep_h + (dmin // 60)) % 24
        arr_m = (dep_m + (dmin % 60)) % 60

        # Direct si demandé ; sinon 0/1 escale déterministe
        direct = int(criteria.get("direct", 0)) == 1
        escales = 0 if direct else (0 if _lcg_float01(s + 11) < 0.65 else 1)

        base = _base_price(s)
        prix = base * price_mul
        # légère dispersion par compagnie
        prix *= 0.95 + 0.1 * _lcg_float01(s + 333)

        compagnie = COMPANIES[int(_lcg_float01(s + 500) * len(COMPANIES))]

        out.append({
            "prix": round(prix, 2),
            "compagnie": compagnie,
            "escales": escales,
            "um_ok": True,
            "animal_ok": True,
            "departISO": _iso(date, dep_h, dep_m),
            "arriveeISO": _iso(date, arr_h, arr_m),
            "duree_minutes": dmin,
        })

    return out