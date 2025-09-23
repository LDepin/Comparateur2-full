# backend/app/services/providers.py
from __future__ import annotations

import os
import logging
from typing import Any, Dict, List, Optional, Protocol, runtime_checkable

Criteria = Dict[str, Any]
logger = logging.getLogger(__name__)


@runtime_checkable
class Provider(Protocol):
    """
    Interface minimale attendue par l'agrégateur.
    Chaque provider doit implémenter get_day_flights().
    """
    name: str

    def get_day_flights(
        self,
        origin: str,
        destination: str,
        date_ymd: str,
        criteria: Criteria,
    ) -> List[Dict[str, Any]]:
        ...


# --------- Chargement dynamique des providers ---------

def _load_provider(name: str) -> Optional[Provider]:
    n = name.strip().lower()
    try:
        if n == "amadeus":
            # On ne bloque pas si les creds ne sont pas fournis : on log et on laisse le fallback.
            client_id = os.getenv("AMADEUS_CLIENT_ID") or os.getenv("AMADEUS_API_KEY")
            client_secret = os.getenv("AMADEUS_CLIENT_SECRET") or os.getenv("AMADEUS_API_SECRET")
            if not client_id or not client_secret:
                logger.warning("providers: 'amadeus' demandé mais AMADEUS_* manquants → skip")
                return None
            from providers.amadeus import AmadeusProvider  # type: ignore
            return AmadeusProvider()
        if n == "dummy":
            from providers.dummy import DummyProvider  # type: ignore
            return DummyProvider()

        logger.warning("providers: nom inconnu '%s' → ignoré", name)
        return None
    except Exception as e:  # pragma: no cover
        logger.warning("providers: échec chargement '%s': %s", name, e)
        return None


# Singleton d'instances chargées (rempli à la 1ère utilisation)
_PROVIDERS: Optional[List[Provider]] = None


def build_providers() -> List[Provider]:
    """
    Lit PROVIDERS (CSV, ex: 'amadeus,dummy') et renvoie la liste d'instances.
    Garantit qu'il y a au moins un provider (fallback dummy).
    """
    global _PROVIDERS
    if _PROVIDERS is not None:
        return _PROVIDERS

    wanted = os.getenv("PROVIDERS", "dummy")
    names = [s.strip() for s in wanted.split(",") if s.strip()]
    out: List[Provider] = []

    for n in names:
        p = _load_provider(n)
        if p:
            out.append(p)

    if not out:
        # Fallback de sécurité
        from providers.dummy import DummyProvider  # type: ignore
        out = [DummyProvider()]
        logger.info("providers: fallback sur dummy (aucun provider valide chargé)")

    _PROVIDERS = out
    logger.info("providers: chargés = %s", ",".join(getattr(p, "name", "unknown") for p in _PROVIDERS))
    return _PROVIDERS


# --------- Helper d’agrégation (priorité au 1er provider qui renvoie des vols) ---------

def get_day_flights(
    origin: str,
    destination: str,
    date_ymd: str,
    criteria: Criteria,
) -> List[Dict[str, Any]]:
    """
    Tente chaque provider dans l'ordre déclaré (ex: amadeus puis dummy).
    Renvoie la 1ère liste non vide ; sinon la dernière (souvent vide).
    """
    flights: List[Dict[str, Any]] = []
    for idx, provider in enumerate(build_providers()):
        try:
            cand = provider.get_day_flights(origin, destination, date_ymd, criteria)
            if cand:
                logger.info(
                    "providers: %s → %d vols (min=%s)",
                    provider.name,
                    len(cand),
                    min((f.get("prix") for f in cand if isinstance(f.get("prix"), (int, float))), default="n/a"),
                )
                return cand
            else:
                logger.info("providers: %s → 0 vol", provider.name)
                flights = cand  # garde la dernière valeur (vide)
        except Exception as e:  # pragma: no cover
            logger.warning("providers: erreur %s: %s", provider.name, e)
            # on continue vers le provider suivant

    return flights