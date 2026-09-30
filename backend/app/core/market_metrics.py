from __future__ import annotations

import logging
import threading
import time
from collections import Counter

logger = logging.getLogger(__name__)

_COUNTERS = Counter()
_LOCK = threading.Lock()
_LAST_LOGGED_AT = 0.0
_LOG_INTERVAL_SECONDS = 30.0


def increment(name: str, value: int = 1) -> None:
    global _LAST_LOGGED_AT
    now = time.monotonic()
    with _LOCK:
        _COUNTERS[name] += value
        if now - _LAST_LOGGED_AT < _LOG_INTERVAL_SECONDS:
            return
        snapshot = dict(_COUNTERS)
        _LAST_LOGGED_AT = now
    logger.info("market_metrics %s", " ".join(f"{key}={value}" for key, value in sorted(snapshot.items())))


def snapshot() -> dict[str, int]:
    with _LOCK:
        return dict(_COUNTERS)
