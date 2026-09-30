# Scalability Phase 2 — Reusable Historical Numerical Preparation

## Scope

Phase 2 targets repeated CPU and memory work from rebuilding the same historical numerical representation across pattern-search, replay, and evaluation requests. The design follows the existing PostgreSQL source of truth and keeps large NumPy structures process-local. No Kafka, Kubernetes, WebSockets, algorithm rewrite, or large Redis payloads were introduced.

The phase specifically addresses:

PostgreSQL historical candles → prepared numerical representation → reusable process-local cache → multiple calculations.

## What was measured

PatternSearchService profiling now separates:
- warmup_check
- numerical_db_load
- array_conversion
- current_pattern
- numerical_store
- ranking
- match_details
- statistics
- diagnostics
- response_build
- total_pattern_search

Profile output also reports candle count, numerical-store estimated bytes, row-cache hit/miss, and numerical-preparation cache hit/miss.

Enable it with:

    PATTERN_SEARCH_PROFILE=true

No new monitoring platform was added. Existing application telemetry is used for cache counters, and the existing profiling flag remains the detailed timing path.

## Reusable unit analysis

NumericalWindowStore contains NumPy timestamps, NumPy close prices, and window metadata. Its current ranking methods read these arrays; they do not intentionally mutate them. Phase 2 therefore marks the retained NumPy arrays read-only before placing the store in the reusable cache.

The reusable unit is not a user-specific final search response. It is only the prepared numerical representation needed by calculations.

The cache key includes:
1. instrument ID
2. timeframe
3. historical start timestamp
4. historical end/latest timestamp
5. latest-candle data version
6. window length
7. numerical preparation version

The data version includes row count and the complete latest OHLCV tuple. This invalidates a prepared store when the currently forming candle changes its OHLCV values without changing its timestamp.

Preparation version is currently numerical-store-v1. Changing the preparation implementation can deliberately invalidate older entries.

## Cache design

Large numerical arrays remain process-local. Redis is not used for NumPy arrays.

The new cache is an in-process bounded LRU/TTL cache implemented in backend/app/services/numerical_cache.py.

Limits are configuration-driven:
- CALC_CACHE_ENABLED=true
- CALC_CACHE_MAX_ENTRIES=4
- CALC_CACHE_TTL_SECONDS=60
- CALC_CACHE_MAX_BYTES=134217728 (128 MiB)
- CALC_PREPARE_LOCK_TIMEOUT_SECONDS=5

An individual prepared store larger than the byte budget is not cached.

The cache evicts least-recently-used entries when either entry count or approximate retained NumPy bytes exceed the configured limit.

## Concurrency / in-flight coalescing

Within one API process, identical preparation requests share one in-flight build. Requests with the same cache identity wait for the first builder and then reuse the same prepared object.

A bounded preparation wait is controlled by CALC_PREPARE_LOCK_TIMEOUT_SECONDS. If the cache is disabled or the wait expires, the request safely falls back to building its own representation.

This lock is deliberately process-local. It is not presented as a global multi-process lock.

## Invalidating stale preparation

A prepared store is never reused across a changed cache identity.

Examples that produce different identities:
- BTCUSDT vs ETHUSDT
- 5m vs 1h
- different replay/evaluation end ranges
- changed latest candle data
- different pattern/window length
- different preparation version

The historical candle database remains authoritative.

## Where reuse was added

### Pattern search

backend/app/search/service.py now obtains a versioned NumericalWindowStore from the reusable cache instead of rebuilding it for every identical request. The existing historical-row cache was also corrected so its latest-candle metadata is actually compared before reuse. The existing final-result cache remains separate and unchanged in semantics.

### Replay

backend/app/api/routes/replay.py now reuses the prepared numerical store when the replay range and preparation identity match. User-specific replay state is not placed in a shared cache.

### Evaluation

backend/app/api/routes/evaluation.py now reuses prepared numerical data for repeated evaluation checkpoints with the same deterministic range identity. Each checkpoint still sees only candles available at that checkpoint. The evaluation algorithm was not rewritten.

### Alerts

backend/app/alerts/service.py was intentionally left on its existing path. The alert implementation uses CandlePoint/PatternWindow objects plus SimilarityV1 and named-pattern detection. The Phase 2 NumericalWindowStore is close-only and therefore is not a drop-in equivalent. Replacing that path without behavioral equivalence proof would risk changing alert behavior.

## Redis usage

No new Redis data type or large numerical payload was introduced for Phase 2. Phase 1 Redis market-state caching remains intact and continues to handle shared latest-market state and live refresh coordination.

## Tests added

backend/app/tests/test_numerical_cache.py covers:
1. identical key reuse
2. instrument isolation
3. timeframe isolation
4. range isolation
5. latest-version isolation
6. preparation-version isolation
7. 20-thread concurrent coalescing
8. LRU eviction
9. TTL expiration
10. disabled-cache fallback
11. read-only numerical arrays
12. estimated-memory reporting

The numerical store ranking methods were not rewritten.

## Benchmark

A repeatable benchmark was added at scripts/benchmark_phase2.py.

Run it against real PostgreSQL candle data with:

    source .venv/bin/activate
    python scripts/benchmark_phase2.py --symbol ETHUSDT --timeframe 5m --pattern-length 45 --top-k 10

It reports, for cache disabled and enabled:
- first/cold request
- second/warm request
- 20 concurrent identical-preparation requests
- concurrent p50/max latency
- cache entry/byte state

The benchmark clears the final response cache between cold/warm measurements so the warm measurement tests reusable numerical preparation rather than final-response memoization.

## Benchmark status

No benchmark numbers are claimed in this commit.

The available runtime cannot execute the repository's Python environment or connect to its PostgreSQL/market-data services. A direct repository clone also could not be performed from this runtime because external GitHub DNS/network access is unavailable.

Therefore:
- no test suite result is labeled as passed;
- no latency reduction percentage is claimed;
- no CPU or memory improvement percentage is claimed.

Run the benchmark on the project machine and record the output before using it as a production capacity claim.

## Files changed

- backend/app/core/config.py
- backend/app/services/numerical_cache.py
- backend/app/search/service.py
- backend/app/api/routes/replay.py
- backend/app/api/routes/evaluation.py
- pattern_engine/retrieval/numerical.py
- backend/app/tests/test_numerical_cache.py
- scripts/benchmark_phase2.py

## Remaining bottlenecks

Phase 2 deliberately does not attempt to solve:
- the O(N × L)-style numerical search cost itself
- ranking algorithm complexity
- alert object-heavy processing
- large historical database reads outside the existing pattern row cache
- cross-process numerical-cache sharing
- result caching for personalized calculations
- evaluation's repeated checkpoint scoring work
- browser refresh behavior from Phase 1
- distributed telemetry aggregation

These remain candidates for measurement-driven later work.

## Recommended Phase 3

Do not jump directly to a distributed architecture rewrite.

The next phase should first use the benchmark/profile output to decide whether the dominant remaining cost is ranking/search CPU, historical database I/O, match outcome/statistics processing, evaluation checkpoint repetition, alert evaluation, or cross-process duplication.

Only after that measurement should a Phase 3 optimization be selected. Candidate work may include cross-process coordination for prepared-data versions, more efficient historical query boundaries, or moving genuinely expensive analytical jobs out of synchronous request handlers, but none of those are implemented here.