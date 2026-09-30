# Scalability Audit

**Audit date:** 2026-09-30
**Scope:** Current default-branch application code inspected through the connected GitHub repository.
**Constraint:** Analysis/documentation only. No application architecture or runtime code was changed in this audit.

## 1. Executive summary

The current application is a coherent Next.js + FastAPI + PostgreSQL system with separate ingestion worker/scheduler processes and Redis already present in the local deployment.

Strong foundations:
- clear separation between frontend, API, pattern engine, market-data providers, repositories, and ingestion workers;
- PostgreSQL as the central source of truth;
- persisted ingestion jobs with PostgreSQL row locking;
- bounded pattern-search concurrency and identical-search coalescing;
- useful frontend/backend in-process caches;
- vectorized NumPy pattern retrieval rather than purely Python nested loops.

Main scalability risks:
1. every chart refreshes candles every 5 seconds;
2. the candle endpoint can call Binance synchronously and can perform a fast historical seed inside the request;
3. pattern search loads an entire instrument/timeframe candle series into Python and performs an O(N x L) numerical scan;
4. alerts perform Python per-window scoring and object construction;
5. replay and evaluation load large candle ranges and repeat numerical scans;
6. caches, semaphores and warmup executors are process-local rather than shared;
7. SQLAlchemy connection-pool settings are not explicitly sized;
8. authentication loads a relatively large ORM graph on every authenticated request.

The correct response is not Kubernetes, Kafka, or a rewrite. First measure and remove hot-path duplication while preserving the current architecture.

## 2. Current architecture

### Frontend
- Next.js 16.3.4
- React 19.2.8
- TypeScript
- Lightweight Charts
- browser-side request cache and in-flight request coalescing
- Next.js backend proxy at frontend/src/app/api/backend/[...path]/route.ts

The proxy forwards browser requests to BACKEND_URL and preserves authentication cookies.

### Backend
- Python 3.12
- FastAPI
- SQLAlchemy 2.0
- psycopg 3
- NumPy / Polars
- Redis client
- HTTPX
- yfinance

API areas registered in backend/app/main.py:
- authentication
- telemetry
- instruments
- quotes
- global market search/selection
- pattern search
- candles
- alerts
- replay search
- evaluation
- admin

### Database
- PostgreSQL; local Docker uses TimescaleDB PostgreSQL 16.
- SQLAlchemy models define instruments, candles, ingestion jobs, users/roles/permissions/plans, usage events and audit data.
- candles has a uniqueness constraint on instrument_id + timeframe + timestamp.

### Workers
- ingestion worker claims persisted ingestion_jobs using PostgreSQL row locking and processes historical downloads;
- ingestion scheduler periodically synchronizes instruments, ranks symbols by volume/usage, and enqueues prioritized ingestion work.
- local Docker Compose also starts Redis.

### Market data
- Binance: crypto instruments, candles and 24h tickers;
- Yahoo Finance: global-market search/selection and quotes.

## 3. Current request/data flow

### Normal chart flow
1. MarketChart renders.
2. It calls prefetchMarketCandles().
3. marketCache.ts calls requestJson().
4. Browser requests /api/backend/api/v1/candles.
5. Next.js proxy forwards to FastAPI.
6. FastAPI authenticates and checks market_memory.view.
7. Instrument is read from PostgreSQL.
8. For Binance live requests, refresh_latest_market_candle() calls Binance.
9. The current candle is upserted into PostgreSQL.
10. The endpoint reads candles from PostgreSQL.
11. Browser renders the chart.
12. MarketChart repeats the refresh every 5 seconds.

This last step is the largest real-time scaling concern.

### Pattern-search flow
1. Browser calls /api/v1/pattern-search.
2. FastAPI authenticates and checks plan limits.
3. Instrument is queried.
4. run_pattern_search() coalesces identical in-flight searches and limits search concurrency per process.
5. PatternSearchService checks/warms market data.
6. The entire candle series for the instrument/timeframe is loaded into Python.
7. NumPy arrays and NumericalWindowStore are created.
8. The selected ranking algorithm scans historical windows.
9. Top matches are expanded into forward outcomes.
10. Statistics and diagnostics are calculated.
11. A short-lived in-process result cache is populated.

### Alert flow
The alert endpoint loads the entire candle series. For the current source it loops over historical windows, constructs PatternWindow/CandlePoint objects and scores them. This is substantially more object-heavy than the vectorized numerical search path.

### Replay flow
Replay ensures data, reads all candles up to replay time, builds a numerical store and performs a pattern search.

### Evaluation flow
Evaluation reads the complete candle series, creates multiple checkpoint stores, runs ranking at each checkpoint, and computes outcomes and regime statistics.

## 4. Calculation flow and complexity

For N candles and pattern length L:

- loading/array construction is approximately O(N);
- historical numerical comparison is approximately O(N x L);
- temporary normalized window arrays can create O(N x L) memory pressure per processing chunk;
- ranking/selection adds sorting/selection work over the eligible windows.

### Pattern search
Approximately O(N x L) CPU for the historical numerical comparison.

### Alerts
Approximately O(N x L) scoring, with additional Python object construction for candidate windows.

### Replay
Approximately O(N + N x L), depending on the ranking algorithm.

### Evaluation
With C checkpoints, the current design can approach O(C x N x L), because each checkpoint creates a numerical store and repeats historical ranking.

### Post-ranking outcomes
For top K matches and fixed horizons, outcome/statistics work is comparatively small: approximately O(K x H), where H is the number of configured horizons.

## 5. Database flow

### Good
- parameterized SQLAlchemy queries;
- composite candle uniqueness constraint;
- bulk insert/upsert statements;
- ordered candle retrieval;
- persisted ingestion jobs;
- PostgreSQL SKIP LOCKED job claiming.

### Concerns
SQLAlchemy engine configuration uses pool_pre_ping=True but does not explicitly configure pool size, max overflow, pool timeout or recycling. This needs production measurement and explicit sizing.

Several analytical endpoints load large candle ranges into Python. That is acceptable at small scale but becomes expensive as history grows.

The live candle endpoint combines external API access, database writes and database reads in one interactive request.

get_current_user() loads roles, permissions, module overrides and plan using selectinload on every authenticated request.

## 6. Real-time data flow

No WebSocket implementation was identified in the inspected frontend/backend paths.

MarketChart uses polling with LIVE_REFRESH_MS = 5,000 ms and calls refreshMarketCandles(). The backend live candle path can then call Binance and update PostgreSQL.

Approximate candle-refresh request rate is U / 5 requests per second for U active charts:

| Active charts | Approx. requests/sec |
|---:|---:|
| 100 | 20 |
| 1,000 | 200 |
| 5,000 | 1,000 |
| 10,000 | 2,000 |

This is before other API calls and before counting the resulting external Binance and database operations.

## 7. Current caching

Frontend:
- requestManager.ts: short TTL cache and in-flight deduplication;
- marketCache.ts: 5-second freshness, 5-minute retention, max 12 market/timeframe entries.

Backend:
- pattern numerical cache: max 16 entries, 60-second TTL;
- pattern result cache: max 24 entries, 20-second TTL;
- in-flight pattern-search coalescing;
- bounded pattern-search concurrency;
- instrument 24h ticker cache: 30-second TTL;
- on-demand warmup running-job map and a ThreadPoolExecutor with max 3 workers.

Important limitation: these are process-local. Multiple API processes create separate caches, separate search limits, separate in-flight maps and separate warmup executors. Redis is available but these hot-path controls are not currently shared through Redis.

## 8. Current bottlenecks

### P0 — Live candle refresh
Files: frontend/src/components/MarketChart.tsx; frontend/src/lib/marketCache.ts; backend/app/api/routes/candles.py; workers/ingestion/on_demand.py

Every active chart polls every five seconds. The same market candle can therefore trigger duplicated Binance calls and database work across users.

### P0 — Full-history pattern search
Files: backend/app/search/service.py; pattern_engine/retrieval/numerical.py; pattern_engine/ranking.py

Complete candle history is loaded into Python and scanned approximately O(N x L). The result/numerical caches are process-local.

### P0 — Alert historical scoring
File: backend/app/alerts/service.py

Historical rows are loaded entirely and candidate windows are scored using Python object construction and loops.

### P1 — Evaluation
File: backend/app/api/routes/evaluation.py

Multiple checkpoints rebuild numerical stores and repeat ranking, producing potentially O(C x N x L) CPU work in one HTTP request.

### P1 — Replay
File: backend/app/api/routes/replay.py

Large candle ranges are read and processed synchronously.

### P1 — On-demand ingestion in request paths
Files: backend/app/api/routes/candles.py; workers/ingestion/on_demand.py

Insufficient data can trigger a synchronous Binance seed, coupling user latency to external provider latency.

### P1 — External provider calls
Files: backend/app/api/routes/quote.py; backend/app/api/routes/instruments.py; backend/app/api/routes/global_markets.py

External provider calls occur in interactive request paths. Quote calls do not appear to have a shared quote cache.

### P1 — Process-local limits
Files: backend/app/search/latency.py; backend/app/search/service.py; workers/ingestion/on_demand.py

Adding API processes multiplies effective concurrency and duplicated background work.

### P1 — Database pool sizing
File: backend/app/db/session.py

Production database connection behavior is not explicitly bounded/tuned.

### P2 — API startup synchronization
File: backend/app/main.py

Every FastAPI process startup calls InstrumentRegistrySync().sync(), mixing maintenance work into web-process startup.

## 9. What is currently good
1. Architecture boundaries are sensible.
2. PostgreSQL is a single central source of truth.
3. Ingestion is already moving toward asynchronous processing with persisted jobs and safe job claiming.
4. Pattern search has duplicate-work coalescing and bounded concurrency.
5. Numerical search is vectorized and chunked.
6. Caching already exists; it needs to become shared where appropriate.
7. Performance instrumentation exists.
8. Dockerfiles and Docker Compose already separate API and ingestion processes.

## 10. What will fail first under heavy traffic

First: duplicated real-time market-data work from 5-second chart polling plus synchronous Binance refresh.

Second: database connection/request capacity because authenticated market requests combine database work, external HTTP and sometimes writes.

Third: CPU/memory pressure from pattern search, alerts, evaluation and replay.

Fourth: external-provider rate/latency pressure caused by provider calls inside interactive endpoints.

## 11. Recommended changes

### Phase 1 — Preserve architecture and remove duplicated work
1. Establish one server-side refresh path per symbol/timeframe.
2. Keep latest market state server-side instead of refreshing Binance independently for every user.
3. Use Redis for shared short-lived market state and request coalescing.
4. Move charts toward a shared server-fed update mechanism while retaining REST for initial/history loading.
5. Keep the existing application architecture.

### Phase 2 — Make expensive calculations reusable
1. Reuse normalized historical data by instrument/timeframe.
2. Avoid rebuilding identical NumericalWindowStore objects for every request.
3. Share expensive result caches across processes.
4. Keep algorithm versions unchanged while optimizing execution around them.
5. Move long evaluations out of the HTTP request path.

### Phase 3 — Database optimization
1. Measure EXPLAIN ANALYZE BUFFERS for hot queries.
2. Verify candle indexes for instrument/timeframe/timestamp range access.
3. Explicitly configure production SQLAlchemy pool limits.
4. Measure active connections, waits and slow queries.
5. Select only required columns.
6. Reduce full-history reads when a bounded range is sufficient.

### Phase 4 — Analytical workload separation
Keep FastAPI for interactive work and use the existing worker/job model for expensive analytical operations. Persist job status/results and let the UI poll job status initially. This avoids introducing a new queue platform prematurely.

### Phase 5 — Horizontal scaling
Only after measurements justify it: multiple API processes/instances, shared Redis, managed PostgreSQL and a load balancer.

## 12. Changes that should NOT be made yet
- Do not introduce Kubernetes.
- Do not introduce Kafka.
- Do not replace PostgreSQL.
- Do not replace FastAPI.
- Do not rewrite the pattern algorithm before measuring the current implementation.
- Do not add random Python/Node dependencies.
- Do not introduce microservices prematurely.
- Do not move all calculations to the browser.

## 13. Prioritized implementation plan

### Priority 0 — Measure
Measure request rate, p50/p95/p99 latency, Binance request rate, DB latency/connections, CPU, memory, pattern-search stage timings, candle counts, cache hit/miss and analytical endpoint duration. Load-test realistic mixes of chart opens, live refreshes, instrument searches, pattern searches, alerts, evaluation and replay.

### Priority 1 — Fix live market-data duplication
Target: frontend/src/components/MarketChart.tsx; frontend/src/lib/marketCache.ts; backend/app/api/routes/candles.py; workers/ingestion/on_demand.py

Goal: one server-side market refresh should serve many users.

### Priority 2 — Shared caching/coalescing
Target: Redis integration around market state and expensive search results.

Goal: cache behavior works across multiple API processes.

### Priority 3 — Database capacity
Target: backend/app/db/session.py, candle schema/index location and repositories.

Goal: explicit connection limits and verified query plans.

### Priority 4 — Analytical workloads
Target: backend/app/search/service.py; backend/app/search/latency.py; pattern_engine/retrieval/numerical.py; backend/app/alerts/service.py; backend/app/api/routes/evaluation.py; backend/app/api/routes/replay.py

Goal: reuse historical numerical data and prevent expensive analysis from monopolizing request workers.

### Priority 5 — Provider/API decoupling
Target: backend/app/api/routes/quote.py; backend/app/api/routes/instruments.py; backend/app/api/routes/global_markets.py; market_data provider modules.

Goal: avoid external provider calls on every interactive request.

### Priority 6 — Horizontal scaling
Only after the previous phases are measured: multiple API instances, shared Redis, managed PostgreSQL and load balancing.

## 14. Exact files that would likely need modification

### Highest priority
- frontend/src/components/MarketChart.tsx
- frontend/src/lib/marketCache.ts
- frontend/src/lib/requestManager.ts
- backend/app/api/routes/candles.py
- workers/ingestion/on_demand.py
- backend/app/db/session.py

### Pattern/search
- backend/app/search/service.py
- backend/app/search/latency.py
- pattern_engine/retrieval/numerical.py
- pattern_engine/ranking.py

### Other analytical workloads
- backend/app/alerts/service.py
- backend/app/api/routes/replay.py
- backend/app/api/routes/evaluation.py

### Provider paths
- backend/app/api/routes/quote.py
- backend/app/api/routes/instruments.py
- backend/app/api/routes/global_markets.py
- market_data/providers/binance.py
- market_data/providers/binance_tickers.py
- market_data/providers/yahoo.py

### Authentication/control plane
- backend/app/auth/user_auth.py
- backend/app/models/admin.py

### Startup/control plane
- backend/app/main.py
- workers/ingestion/scheduler.py
- workers/ingestion/runner.py

### Deployment
- infra/docker-compose.yml
- infra/Dockerfile.app
- infra/Dockerfile.worker
- production environment/configuration.

## 15. Final audit report

### 1. What is currently good
The application already has a reasonable foundation for scaling: modular FastAPI code, PostgreSQL as the central store, persisted ingestion jobs, safe job claiming, vectorized numerical search, caching, request coalescing, Redis in the deployment foundation, and separate ingestion processes.

### 2. What will fail first
The 5-second per-chart polling + synchronous Binance refresh + database read/write path is the first major scaling risk. Analytical endpoints are the next major risk because several load complete historical datasets and perform O(N x L) or repeated O(N x L) processing synchronously.

### 3. What should be changed first
First measure the hot paths, then eliminate duplicated market-data refresh work and make shared market state/cache server-side. Next tune the database connection/query path and make expensive analytical data reusable.

### 4. What should be changed later
After measurement: background analytical jobs, shared Redis caches, horizontal API scaling, managed production infrastructure, load balancing and only then any specialized infrastructure justified by observed demand.

### 5. Exact files needing modification
The first implementation wave should focus on:
- frontend/src/components/MarketChart.tsx
- frontend/src/lib/marketCache.ts
- frontend/src/lib/requestManager.ts
- backend/app/api/routes/candles.py
- workers/ingestion/on_demand.py
- backend/app/db/session.py

The second wave should focus on the pattern/search/analytics files listed above.

## Audit conclusion

The existing architecture does not need to be thrown away to support thousands of concurrent users.

The main problem is not that Next.js, FastAPI, PostgreSQL or the current pattern engine are inherently unsuitable. The main problem is that identical work is currently repeated per user and per request, especially live market-data refreshes and historical numerical processing.

The safest strategy is: measure -> remove duplicated work -> share cached market state -> control database concurrency -> move only genuinely expensive work off request paths -> then scale horizontally.

No architectural rewrite is justified by the current code inspection alone.