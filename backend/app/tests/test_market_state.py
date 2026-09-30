from __future__ import annotations

import threading
import time
import unittest
from unittest.mock import Mock, patch

import redis

from backend.app.services.market_state import MarketState, MarketStateService


class FakeRedis:
    def __init__(self) -> None:
        self.values: dict[str, tuple[str, float | None]] = {}
        self.locks: dict[str, tuple[str, float | None]] = {}
        self._lock = threading.Lock()

    def get(self, key: str):
        with self._lock:
            item = self.values.get(key)
            if item is None:
                return None
            value, expires_at = item
            if expires_at is not None and time.monotonic() >= expires_at:
                self.values.pop(key, None)
                return None
            return value

    def set(self, key: str, value: str, nx=False, ex=None):
        with self._lock:
            if nx:
                current = self.locks.get(key)
                if current is not None:
                    token, expires_at = current
                    if expires_at is None or time.monotonic() < expires_at:
                        return False
                    self.locks.pop(key, None)
                self.locks[key] = (value, time.monotonic() + ex if ex else None)
                return True
            self.values[key] = (value, time.monotonic() + ex if ex else None)
            return True

    def eval(self, script, numkeys, key, token):
        with self._lock:
            current = self.locks.get(key)
            if current and current[0] == token:
                del self.locks[key]
                return 1
            return 0


class MarketStateServiceTests(unittest.TestCase):
    def setUp(self):
        self.redis = FakeRedis()
        self.patcher = patch.object(MarketStateService, "_client", self.redis)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)

    @staticmethod
    def state(close=100.0):
        return {
            "time": 123,
            "open": close,
            "high": close,
            "low": close,
            "close": close,
            "volume": 1.0,
        }

    def test_cache_hit_does_not_refresh(self):
        MarketStateService.set_latest(
            MarketState("ETHUSDT", "5m", self.state(), time.time())
        )
        refresh = Mock(return_value=self.state(101))
        result = MarketStateService.get_or_refresh(
            "ETHUSDT", "5m", refresh, lambda: self.state(99)
        )
        self.assertTrue(result.cache_hit)
        refresh.assert_not_called()

    def test_cache_miss_refreshes(self):
        refresh = Mock(return_value=self.state(101))
        result = MarketStateService.get_or_refresh(
            "ETHUSDT", "5m", refresh, lambda: self.state(99)
        )
        self.assertTrue(result.provider_refreshed)
        self.assertEqual(result.state.candle["close"], 101)
        refresh.assert_called_once()

    def test_concurrent_refresh_only_one_provider_call(self):
        calls = 0
        calls_lock = threading.Lock()
        barrier = threading.Barrier(20)

        def refresh():
            nonlocal calls
            with calls_lock:
                calls += 1
            time.sleep(0.08)
            return self.state(101)

        results = []

        def worker():
            barrier.wait()
            results.append(
                MarketStateService.get_or_refresh(
                    "BTCUSDT", "5m", refresh, lambda: self.state(99)
                )
            )

        threads = [threading.Thread(target=worker) for _ in range(20)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        self.assertEqual(calls, 1)
        self.assertTrue(any(result.provider_refreshed for result in results))
        self.assertTrue(all(result.state is not None for result in results))

    def test_different_symbols_do_not_share_lock(self):
        self.assertTrue(MarketStateService._acquire_lock("BTCUSDT", "5m", "btc"))
        self.assertTrue(MarketStateService._acquire_lock("ETHUSDT", "5m", "eth"))

    def test_different_timeframes_do_not_share_lock(self):
        self.assertTrue(MarketStateService._acquire_lock("BTCUSDT", "1m", "one"))
        self.assertTrue(MarketStateService._acquire_lock("BTCUSDT", "5m", "five"))

    def test_lock_expires(self):
        key = MarketStateService.lock_key("BTCUSDT", "5m")
        self.redis.locks[key] = ("abandoned", time.monotonic() - 1)
        self.assertTrue(MarketStateService._acquire_lock("BTCUSDT", "5m", "new"))

    def test_redis_unavailable_uses_fallback(self):
        with patch.object(
            MarketStateService,
            "_redis",
            side_effect=redis.RedisError("redis down"),
        ):
            refresh = Mock()
            result = MarketStateService.get_or_refresh(
                "ETHUSDT", "5m", refresh, lambda: self.state(99)
            )
        refresh.assert_not_called()
        self.assertFalse(result.redis_available)
        self.assertEqual(result.state.candle["close"], 99)


if __name__ == "__main__":
    unittest.main()
