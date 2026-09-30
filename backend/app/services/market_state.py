from __future__ import annotations

import json
import logging
import time
import uuid
from dataclasses import dataclass
from threading import Lock
from typing import Any, Callable, Mapping

import redis

from backend.app.core.config import get_settings
from backend.app.core.market_metrics import increment

logger = logging.getLogger(__name__)

CACHE_PREFIX = "market:candle"
LOCK_PREFIX = "market:candle:refresh-lock"
CACHE_TTL_SECONDS = 4
STATE_FRESHNESS_SECONDS = 2.5
LOCK_TTL_SECONDS = 10
WAIT_ATTEMPTS = 4
WAIT_SECONDS = 0.15

_RELEASE_LOCK_SCRIPT = """
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
end
return 0
"""


@dataclass(frozen=True)
class MarketState:
    symbol: str
    timeframe: str
    candle: Mapping[str, Any]
    refreshed_at: float


@dataclass(frozen=True)
class RefreshResult:
    state: MarketState | None
    cache_hit: bool
    lock_acquired: bool
    lock_contended: bool
    provider_refreshed: bool
    redis_available: bool


class MarketStateService:
    """Shared latest-market-state cache and refresh coordinator.

    Redis is deliberately only a short-lived coordination/cache layer.
    PostgreSQL remains the source of truth and the supplied refresh/fallback
    callbacks own persistence and database reads.
    """

    _client: redis.Redis[str] | None = None
    _client_lock = Lock()
    _redis_failure_logged_at = 0.0

    @classmethod
    def _redis(cls) -> redis.Redis[str]:
        with cls._client_lock:
            if cls._client is None:
                cls._client = redis.from_url(
                    get_settings().redis_url,
                    decode_responses=True,
                    socket_connect_timeout=0.25,
                    socket_timeout=0.5,
                    health_check_interval=30,
                )
            return cls._client

    @staticmethod
    def cache_key(symbol: str, timeframe: str) -> str:
        return f"{CACHE_PREFIX}:{symbol.strip().upper()}:{timeframe.strip().lower()}"

    @staticmethod
    def lock_key(symbol: str, timeframe: str) -> str:
        return f"{LOCK_PREFIX}:{symbol.strip().upper()}:{timeframe.strip().lower()}"

    @classmethod
    def _log_redis_failure(cls, operation: str, exc: Exception) -> None:
        now = time.monotonic()
        # Avoid turning a Redis outage into one warning per chart request.
        if now - cls._redis_failure_logged_at >= 30:
            cls._redis_failure_logged_at = now
            increment("redis_errors")
            logger.warning("market_state_redis_error operation=%s error=%s", operation, exc)

    @classmethod
    def get_latest(cls, symbol: str, timeframe: str) -> MarketState | None:
        try:
            payload = cls._redis().get(cls.cache_key(symbol, timeframe))
        except redis.RedisError as exc:
            cls._log_redis_failure("get", exc)
            return None
        if not payload:
            return None
        try:
            data = json.loads(payload)
            refreshed_at = float(data["refreshed_at"])
            if time.time() - refreshed_at > STATE_FRESHNESS_SECONDS:
                return None
            return MarketState(
                symbol=str(data["symbol"]),
                timeframe=str(data["timeframe"]),
                candle=data["candle"],
                refreshed_at=refreshed_at,
            )
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            return None

    @classmethod
    def set_latest(cls, state: MarketState) -> bool:
        payload = json.dumps(
            {
                "symbol": state.symbol,
                "timeframe": state.timeframe,
                "candle": dict(state.candle),
                "refreshed_at": state.refreshed_at,
            },
            separators=(",", ":"),
        )
        try:
            cls._redis().set(
                cls.cache_key(state.symbol, state.timeframe),
                payload,
                ex=CACHE_TTL_SECONDS,
            )
            return True
        except redis.RedisError as exc:
            cls._log_redis_failure("set", exc)
            return False

    @classmethod
    def _acquire_lock(cls, symbol: str, timeframe: str, token: str) -> bool | None:
        try:
            return bool(
                cls._redis().set(
                    cls.lock_key(symbol, timeframe),
                    token,
                    nx=True,
                    ex=LOCK_TTL_SECONDS,
                )
            )
        except redis.RedisError as exc:
            cls._log_redis_failure("lock_acquire", exc)
            return None

    @classmethod
    def _release_lock(cls, symbol: str, timeframe: str, token: str) -> None:
        try:
            cls._redis().eval(
                _RELEASE_LOCK_SCRIPT,
                1,
                cls.lock_key(symbol, timeframe),
                token,
            )
        except redis.RedisError as exc:
            cls._log_redis_failure("lock_release", exc)

    @staticmethod
    def _state_from_mapping(symbol: str, timeframe: str, value: Mapping[str, Any] | None) -> MarketState | None:
        if value is None:
            return None
        return MarketState(
            symbol=symbol,
            timeframe=timeframe,
            candle=value,
            refreshed_at=time.time(),
        )

    @classmethod
    def get_or_refresh(
        cls,
        symbol: str,
        timeframe: str,
        refresh: Callable[[], Mapping[str, Any] | None],
        fallback: Callable[[], Mapping[str, Any] | None],
    ) -> RefreshResult:
        symbol = symbol.strip().upper()
        timeframe = timeframe.strip().lower()

        try:
            client = cls._redis()
            redis_available = True
        except redis.RedisError as exc:
            cls._log_redis_failure("client", exc)
            redis_available = False
            client = None

        if client is None:
            fallback_state = cls._state_from_mapping(symbol, timeframe, fallback())
            return RefreshResult(
                state=fallback_state,
                cache_hit=False,
                lock_acquired=False,
                lock_contended=False,
                provider_refreshed=False,
                redis_available=False,
            )

        cached = cls.get_latest(symbol, timeframe)
        if cached is not None:
            increment("market_cache_hit")
            logger.debug("market_cache_hit symbol=%s timeframe=%s", symbol, timeframe)
            return RefreshResult(cached, True, False, False, False, redis_available)

        increment("market_cache_miss")
        token = uuid.uuid4().hex
        lock_acquired = cls._acquire_lock(symbol, timeframe, token)
        if lock_acquired is None:
            fallback_state = cls._state_from_mapping(symbol, timeframe, fallback())
            return RefreshResult(fallback_state, False, False, False, False, False)
        if lock_acquired:
            increment("refresh_lock_acquired")
            logger.info("market_refresh_lock_acquired symbol=%s timeframe=%s", symbol, timeframe)
            try:
                # Another process can populate the cache between the initial
                # read and lock acquisition.
                cached = cls.get_latest(symbol, timeframe)
                if cached is not None:
                    increment("market_cache_hit")
                    return RefreshResult(cached, True, True, False, False, redis_available)

                started = time.perf_counter()
                refreshed = refresh()
                latency_ms = (time.perf_counter() - started) * 1000
                if refreshed is not None:
                    state = cls._state_from_mapping(symbol, timeframe, refreshed)
                    cls.set_latest(state)
                    increment("provider_refresh_performed")
                    logger.info(
                        "market_provider_refresh symbol=%s timeframe=%s latency_ms=%.1f",
                        symbol,
                        timeframe,
                        latency_ms,
                    )
                    return RefreshResult(state, False, True, False, True, redis_available)

                fallback_state = cls._state_from_mapping(symbol, timeframe, fallback())
                return RefreshResult(fallback_state, False, True, False, False, redis_available)
            finally:
                cls._release_lock(symbol, timeframe, token)

        increment("refresh_lock_contention")
        logger.info("market_refresh_lock_contention symbol=%s timeframe=%s", symbol, timeframe)
        for _ in range(WAIT_ATTEMPTS):
            time.sleep(WAIT_SECONDS)
            cached = cls.get_latest(symbol, timeframe)
            if cached is not None:
                increment("provider_refresh_skipped")
                logger.debug("market_refresh_skipped symbol=%s timeframe=%s", symbol, timeframe)
                return RefreshResult(cached, False, False, True, False, redis_available)

        # Never wait indefinitely and never let a contending request call the
        # provider. PostgreSQL remains the safe fallback.
        fallback_state = cls._state_from_mapping(symbol, timeframe, fallback())
        return RefreshResult(fallback_state, False, False, True, False, redis_available)
