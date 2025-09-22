# backend/app/services/cache.py
from __future__ import annotations
from dataclasses import dataclass
from time import time
from typing import Any, Dict, Optional
import json
import hashlib
import os
import logging

log = logging.getLogger(__name__)

def _env_int(name: str, default: int) -> int:
    try:
        v = int(os.getenv(name, str(default)))
        return max(0, v)
    except Exception:
        return default

CACHE_TTL_CALENDAR_DEFAULT = 1800  # 30 min
CACHE_TTL_DAY_DEFAULT = 900        # 15 min

CACHE_TTL_CALENDAR = _env_int("CACHE_TTL_CALENDAR", CACHE_TTL_CALENDAR_DEFAULT)
CACHE_TTL_DAY = _env_int("CACHE_TTL_DAY", CACHE_TTL_DAY_DEFAULT)

@dataclass
class CacheEntry:
    value: Any
    expires_at: float

class InMemoryCache:
    """
    Cache mémoire *très* simple (process-local).
    """
    def __init__(self) -> None:
        self._store: Dict[str, CacheEntry] = {}

    def get(self, key: str) -> Optional[Any]:
        now = time()
        e = self._store.get(key)
        if not e:
            log.info("[cache] MISS %s", key[:80])
            return None
        if e.expires_at < now:
            log.info("[cache] EXPIRED %s", key[:80])
            self._store.pop(key, None)
            return None
        log.info("[cache] HIT %s", key[:80])
        return e.value

    def set(self, key: str, value: Any, ttl: int) -> None:
        self._store[key] = CacheEntry(value=value, expires_at=time() + max(1, ttl))
        log.info("[cache] SET %s (ttl=%ss)", key[:80], ttl)

    def touch(self, key: str, ttl: int) -> None:
        e = self._store.get(key)
        if e:
            e.expires_at = time() + max(1, ttl)

cache = InMemoryCache()

def criteria_hash(criteria: Dict[str, Any]) -> str:
    """
    Hash stable (sha1) d'un JSON *normalisé* (tri des clés, valeurs simples).
    """
    payload = json.dumps(criteria, sort_keys=True, separators=(",", ":"))
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()

def cal_key(origin: str, destination: str, month: str, criteria: Dict[str, Any]) -> str:
    return f"CAL:{origin.upper()}:{destination.upper()}:{month}:{criteria_hash(criteria)}"

def day_key(origin: str, destination: str, date: str, criteria: Dict[str, Any]) -> str:
    return f"DAY:{origin.upper()}:{destination.upper()}:{date}:{criteria_hash(criteria)}"