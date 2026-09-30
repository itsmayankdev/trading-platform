from __future__ import annotations

import threading
import time
from dataclasses import replace

import pytest

from backend.app.core.config import get_settings
from backend.app.services.numerical_cache import (
    NumericalCacheKey,
    PREPARATION_VERSION,
    PreparedNumericalCache,
)
from pattern_engine.retrieval.numerical import NumericalWindowStore
from pattern_engine.window import CandlePoint


def _key(**overrides) -> NumericalCacheKey:
    values = {
        "instrument_id": 1,
        "timeframe": "5m",
        "start_timestamp": 1,
        "end_timestamp": 100,
        "latest_timestamp": 100,
        "data_version": "100|1|2|0|1.5|10",
        "window_length": 5,
    }
    values.update(overrides)
    return NumericalCacheKey(**values)


@pytest.fixture(autouse=True)
def cache_settings(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://test/test")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setenv("CALC_CACHE_ENABLED", "true")
    monkeypatch.setenv("CALC_CACHE_MAX_ENTRIES", "2")
    monkeypatch.setenv("CALC_CACHE_TTL_SECONDS", "0.05")
    monkeypatch.setenv("CALC_CACHE_MAX_BYTES", "1024")
    monkeypatch.setenv("CALC_PREPARE_LOCK_TIMEOUT_SECONDS", "1")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_identical_key_reuses_prepared_store():
    cache = PreparedNumericalCache()
    calls = 0

    def build():
        nonlocal calls
        calls += 1
        return object()

    first, hit1 = cache.get_or_build(_key(), build, lambda _: 32)
    second, hit2 = cache.get_or_build(_key(), build, lambda _: 32)

    assert first is second
    assert hit1 is False
    assert hit2 is True
    assert calls == 1


def test_identity_dimensions_do_not_collide():
    cache = PreparedNumericalCache()
    first, _ = cache.get_or_build(_key(), lambda: "instrument-1", lambda _: 1)
    other_instrument, _ = cache.get_or_build(_key(instrument_id=2), lambda: "instrument-2", lambda _: 1)
    other_timeframe, _ = cache.get_or_build(_key(timeframe="1h"), lambda: "1h", lambda _: 1)
    other_range, _ = cache.get_or_build(_key(start_timestamp=2), lambda: "range-2", lambda _: 1)
    other_version, _ = cache.get_or_build(_key(data_version="changed"), lambda: "changed", lambda _: 1)
    other_prep, _ = cache.get_or_build(_key(preparation_version="numerical-store-v2"), lambda: "v2", lambda _: 1)

    assert (first, other_instrument, other_timeframe, other_range, other_version, other_prep) == (
        "instrument-1", "instrument-2", "1h", "range-2", "changed", "v2"
    )
    assert PREPARATION_VERSION == "numerical-store-v1"


def test_changed_latest_version_uses_new_entry():
    cache = PreparedNumericalCache()
    first, _ = cache.get_or_build(_key(), lambda: "old", lambda _: 1)
    changed = replace(_key(), latest_timestamp=101, end_timestamp=101, data_version="101|1|2|0|2|10")
    second, hit = cache.get_or_build(changed, lambda: "new", lambda _: 1)

    assert first == "old"
    assert second == "new"
    assert hit is False


def test_concurrent_identical_preparation_coalesces():
    cache = PreparedNumericalCache()
    calls = 0
    calls_lock = threading.Lock()
    barrier = threading.Barrier(20)
    results = []

    def build():
        nonlocal calls
        with calls_lock:
            calls += 1
        time.sleep(0.05)
        return object()

    def worker():
        barrier.wait()
        results.append(cache.get_or_build(_key(), build, lambda _: 16)[0])

    threads = [threading.Thread(target=worker) for _ in range(20)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert calls == 1
    assert len({id(result) for result in results}) == 1


def test_lru_eviction_and_ttl():
    cache = PreparedNumericalCache()
    cache.get_or_build(_key(instrument_id=1), lambda: "one", lambda _: 1)
    cache.get_or_build(_key(instrument_id=2), lambda: "two", lambda _: 1)
    cache.get_or_build(_key(instrument_id=3), lambda: "three", lambda _: 1)

    assert cache.stats()["entries"] == 2
    time.sleep(0.06)
    _, hit = cache.get_or_build(_key(instrument_id=3), lambda: "three-new", lambda _: 1)
    assert hit is False


def test_cache_disabled_falls_back_to_builder(monkeypatch):
    monkeypatch.setenv("CALC_CACHE_ENABLED", "false")
    get_settings.cache_clear()
    cache = PreparedNumericalCache()
    calls = 0

    def build():
        nonlocal calls
        calls += 1
        return object()

    first, hit1 = cache.get_or_build(_key(), build, lambda _: 1)
    second, hit2 = cache.get_or_build(_key(), build, lambda _: 1)

    assert first is not second
    assert hit1 is False
    assert hit2 is False
    assert calls == 2


def test_numerical_store_is_read_only_and_reusable():
    candles = [
        CandlePoint(timestamp=i, open=1.0, high=1.0, low=1.0, close=float(i + 1), volume=1.0)
        for i in range(10)
    ]
    store = NumericalWindowStore(candles, 5)
    assert store.estimated_bytes() > 0
    with pytest.raises(ValueError):
        store.close[0] = 999.0
