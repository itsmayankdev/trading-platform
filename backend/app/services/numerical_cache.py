from __future__ import annotations

import time
from collections import OrderedDict
from dataclasses import dataclass
from threading import Event, Lock
from typing import Callable, Generic, TypeVar

from backend.app.core.config import get_settings
from backend.app.core.market_metrics import increment

T = TypeVar("T")

PREPARATION_VERSION = "numerical-store-v1"


@dataclass(frozen=True)
class NumericalCacheKey:
    instrument_id: int
    timeframe: str
    start_timestamp: object
    end_timestamp: object
    latest_timestamp: object
    data_version: str
    window_length: int
    preparation_version: str = PREPARATION_VERSION


@dataclass
class _Entry(Generic[T]):
    created_at: float
    value: T
    estimated_bytes: int


class PreparedNumericalCache(Generic[T]):
    """Bounded process-local cache for immutable numerical preparation.

    The cache stores prepared objects only. Historical candle data remains in
    PostgreSQL, and no numerical arrays are serialized into Redis.
    """

    def __init__(self) -> None:
        self._entries: OrderedDict[NumericalCacheKey, _Entry[T]] = OrderedDict()
        self._inflight: dict[NumericalCacheKey, Event] = {}
        self._lock = Lock()
        self._bytes = 0

    def _settings(self):
        return get_settings()

    def _enabled(self) -> bool:
        settings = self._settings()
        return bool(settings.calc_cache_enabled and settings.calc_cache_max_entries > 0 and settings.calc_cache_ttl_seconds > 0)

    def _get(self, key: NumericalCacheKey) -> T | None:
        if not self._enabled():
            return None
        now = time.monotonic()
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            if now - entry.created_at > self._settings().calc_cache_ttl_seconds:
                self._entries.pop(key, None)
                self._bytes -= entry.estimated_bytes
                increment("numerical_cache_expired")
                return None
            self._entries.move_to_end(key)
            increment("numerical_cache_hit")
            return entry.value

    def _put(self, key: NumericalCacheKey, value: T, estimated_bytes: int) -> bool:
        settings = self._settings()
        if not self._enabled():
            return False
        estimated_bytes = max(0, int(estimated_bytes))
        if estimated_bytes > settings.calc_cache_max_bytes:
            increment("numerical_cache_oversize_skip")
            return False

        with self._lock:
            previous = self._entries.pop(key, None)
            if previous is not None:
                self._bytes -= previous.estimated_bytes
            self._entries[key] = _Entry(time.monotonic(), value, estimated_bytes)
            self._bytes += estimated_bytes
            self._entries.move_to_end(key)
            while self._entries and (
                len(self._entries) > settings.calc_cache_max_entries
                or self._bytes > settings.calc_cache_max_bytes
            ):
                _, evicted = self._entries.popitem(last=False)
                self._bytes -= evicted.estimated_bytes
                increment("numerical_cache_eviction")
        increment("numerical_cache_store")
        return True

    def get_or_build(
        self,
        key: NumericalCacheKey,
        builder: Callable[[], T],
        estimated_bytes: Callable[[T], int],
    ) -> tuple[T, bool]:
        cached = self._get(key)
        if cached is not None:
            return cached, True

        if not self._enabled():
            increment("numerical_cache_disabled")
            return builder(), False

        owner = False
        event: Event | None = None
        with self._lock:
            event = self._inflight.get(key)
            if event is None:
                event = Event()
                self._inflight[key] = event
                owner = True

        if not owner:
            increment("numerical_cache_coalesced_wait")
            event.wait(timeout=max(0.0, self._settings().calc_prepare_lock_timeout_seconds))
            cached = self._get(key)
            if cached is not None:
                return cached, True
            increment("numerical_cache_coalesce_timeout")

        try:
            # Another thread may have completed between the first lookup and
            # becoming the builder after a timeout.
            cached = self._get(key)
            if cached is not None:
                return cached, True
            increment("numerical_cache_build")
            value = builder()
            self._put(key, value, estimated_bytes(value))
            return value, False
        finally:
            if owner:
                with self._lock:
                    self._inflight.pop(key, None)
                    event.set()

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()
            self._bytes = 0

    def stats(self) -> dict[str, int | float]:
        with self._lock:
            settings = self._settings()
            return {
                "entries": len(self._entries),
                "bytes": self._bytes,
                "max_entries": settings.calc_cache_max_entries,
                "max_bytes": settings.calc_cache_max_bytes,
                "ttl_seconds": settings.calc_cache_ttl_seconds,
            }


prepared_numerical_cache: PreparedNumericalCache = PreparedNumericalCache()


def numerical_store_key(
    instrument_id: int,
    timeframe: str,
    rows,
    window_length: int,
) -> NumericalCacheKey:
    if not rows:
        raise ValueError("Cannot build a numerical cache key without candles")
    latest = rows[-1]
    start_timestamp = rows[0].timestamp
    end_timestamp = latest.timestamp
    # Include the complete latest candle and row count. This invalidates a
    # prepared store when the currently-forming latest candle is updated at the
    # same timestamp, without hashing the full historical dataset.
    data_version = "|".join(
        str(value)
        for value in (
            len(rows),
            latest.timestamp,
            latest.open,
            latest.high,
            latest.low,
            latest.close,
            latest.volume,
        )
    )
    return NumericalCacheKey(
        instrument_id=instrument_id,
        timeframe=timeframe,
        start_timestamp=start_timestamp,
        end_timestamp=end_timestamp,
        latest_timestamp=latest.timestamp,
        data_version=data_version,
        window_length=window_length,
    )
