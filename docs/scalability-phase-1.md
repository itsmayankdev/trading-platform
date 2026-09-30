# Scalability Phase 1 — Shared Live Market State

Date: 2026-09-30

## Goal
Phase 1 removes duplicated live Binance refresh work from interactive candle requests without changing the application architecture, pattern algorithms, authentication, PostgreSQL source of truth, or API response schema.

## Old request flow
Browser chart -> every 5 seconds -> FastAPI /api/v1/candles -> refresh_latest_market_candle() -> Binance -> PostgreSQL upsert -> PostgreSQL candle read -> browser.

With many users on the same symbol/timeframe, the same provider refresh can be performed repeatedly.

## New request flow
Browser chart -> FastAPI /api/v1/candles -> shared Redis latest-state check.
Fresh state: use it and skip Binance.
Stale/missing state: acquire distributed refresh lock.
One lock owner calls the existing refresh_latest_market_candle().
PostgreSQL remains the persistence source of truth.
Compact latest candle state is stored in Redis.
Concurrent callers use the same state or bounded PostgreSQL fallback.

Historical candle reads remain PostgreSQL-backed. Redis does not store complete historical candle arrays.

## Redis keys
Latest state: market:candle:{SYMBOL}:{TIMEFRAME}
Examples: market:candle:BTCUSDT:5m and market:candle:ETHUSDT:1m.
Refresh lock: market:candle:refresh-lock:{SYMBOL}:{TIMEFRAME}
The symbol is upper-cased and timeframe lower-cased before key construction.

## Cached value
One compact JSON object containing symbol, timeframe, latest candle (time/open/high/low/close/volume), and refreshed_at.
The Redis cache TTL is 4 seconds. State freshness is 2.5 seconds.
No historical candle arrays are stored in Redis.

## Refresh lock
The refresh lock uses Redis SET with NX and EX semantics.
- lock TTL: 10 seconds;
- lock value: random per-request token;
- lock release uses an ownership-checking Lua script;
- a crashed process cannot hold the lock permanently.

The lock is per symbol/timeframe, so BTCUSDT 5m and ETHUSDT 5m do not block each other, and BTCUSDT 1m and BTCUSDT 5m do not block each other.

## Concurrent requests
For a cold/stale key:
1. first request acquires the lock;
2. it calls the existing Binance refresh path;
3. it persists the candle to PostgreSQL;
4. it writes the latest candle to Redis;
5. it releases the lock.

Other requests observe the refresh lock, do not call Binance, wait in bounded 150 ms intervals, retry shared Redis state up to four times, and otherwise fall back to PostgreSQL.

Maximum intentional contention wait is approximately 600 ms. A contending request never calls Binance.

## Redis failure behavior
Redis is not the source of truth.
If Redis cannot be reached, cache lookup produces no state, lock acquisition fails fast, and the request falls back to the existing PostgreSQL/provider behavior. Redis failures are rate-limited in logs.

## PostgreSQL behavior
PostgreSQL remains authoritative.
The existing refresh_latest_market_candle() implementation continues to perform the Binance fetch and PostgreSQL upsert. Redis only distributes the resulting latest state to concurrent API processes/users.
Historical and bounded candle requests continue using the existing repository behavior.

## Frontend behavior
The browser still uses MarketChart.tsx, marketCache.ts, and requestManager.ts and continues polling temporarily.
No WebSocket implementation was added.
The important change is server-side: a forced browser refresh no longer implies a fresh Binance request when another user/process has already refreshed the same symbol/timeframe recently.

## Existing on-demand ingestion
The existing workers/ingestion/on_demand.py system remains responsible for data coverage and historical seeding.
Phase 1 does not replace its persisted ingestion-job model.
The live candle path now coordinates the current-candle provider refresh separately, so the existing long-history worker remains a separate concern.

## Instrumentation
Added process-local market refresh counters:
- market_cache_hit
- market_cache_miss
- refresh_lock_acquired
- refresh_lock_contention
- provider_refresh_performed
- provider_refresh_skipped
- redis_errors

The service logs provider refresh latency. Existing FastAPI performance middleware continues to provide candle endpoint timing when PERFORMANCE_DEBUG=true.
The counters are intentionally lightweight and process-local in Phase 1. A shared production metrics backend is not introduced in this phase.

## Tests added
backend/app/tests/test_market_state.py covers:
- fresh cache hit does not refresh;
- cache miss refreshes;
- 20 concurrent callers produce one provider refresh;
- different symbols have different locks;
- different timeframes have different locks;
- lock expiry;
- Redis failure fallback.

## Files changed
- backend/app/services/market_state.py
- backend/app/core/market_metrics.py
- backend/app/api/routes/candles.py
- backend/app/tests/test_market_state.py
- docs/scalability-phase-1.md

No frontend code was changed because the existing browser cache/in-flight behavior remains useful and the requested Phase 1 objective is server-side refresh coalescing.

## Verification status
The repository was inspected through the connected GitHub source, but this environment does not expose the repository working tree to a local test runner. Therefore no claim is made here that the new test suite or a 20-request live concurrency test has executed.
The added unit test contains the requested 20-thread same-symbol/timeframe concurrency scenario and asserts exactly one provider callback.

## Phase 2
Phase 2 should address shared/push-based real-time delivery and broader shared caching/analytics execution after Phase 1 has been load-tested.
WebSockets should be considered later for delivery efficiency; they are deliberately not part of this change.