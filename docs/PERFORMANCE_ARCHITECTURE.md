# Platform Performance Architecture

The platform treats speed as a cross-cutting system property. Every user operation follows the same pipeline:

`intent -> request key -> cache/in-flight check -> minimum required data -> foreground computation -> render -> background refresh`

## 1. Latency budgets

- UI interaction: immediate visual acknowledgement; never block on unrelated work.
- Initial chart paint: use retained market data first when available.
- API hot paths: measure total request time and stage time in development diagnostics.
- Heavy historical ingestion: background only unless the requested operation genuinely needs missing data.
- Exactness always wins over an optimization that changes ranking or outcome calculations.

## 2. Work classification

### Foreground
Only the minimum work required to answer the current user operation:

- requested symbol/provider
- requested timeframe
- requested candle depth
- requested result count

### Background
Work that improves future requests but is not required for the current response:

- deep historical backfill
- other timeframes
- usage-driven promotion
- cache refresh

A foreground request must never fan out into unrelated background jobs.

## 3. Data lifecycle

`HOT -> WARM -> COLD`

- **HOT:** currently selected market/timeframe; refresh frequently and serve from memory when safe.
- **WARM:** recently used markets/timeframes; retain reusable data and promote by actual usage.
- **COLD:** not recently requested; ingest only when usage or policy promotes it.

## 4. Request control

The frontend shared request manager provides:

- short-lived response caching
- in-flight request deduplication
- bounded request timeouts
- credentials-preserving requests
- explicit invalidation

Market candle loading adds stale-while-revalidate behavior: retained candles paint immediately, then a background refresh replaces them only when the dataset signature changes.

## 5. Chart rendering

- `setData()` is used only when the dataset actually changes.
- Crosshair lookup is O(1) through a timestamp map rather than scanning the full candle array.
- Number/date formatters are reused rather than constructed for every pointer event.
- A market switch cannot paint a response belonging to an old component instance.

## 6. Ingestion isolation

A chart request for `5m` schedules only `5m` history warming. It does not automatically start `15m` or `1h` downloads. Other timeframes are loaded when requested or promoted by the scheduler.

## 7. Pattern retrieval

Pattern ranking keeps V1 scoring semantics unchanged while bounding temporary memory. Long histories are processed in chunks, producing the same score for every candidate without materializing the entire normalized-window matrix at once.

The next retrieval stage should remain two-phase:

1. cheap numerical candidate generation
2. exact/high-cost validation only for the best candidates

No accuracy-affecting approximation should be introduced without a benchmark proving equivalence or an explicit product decision.

## 8. Database strategy

Hot queries should use the existing candle uniqueness/index path on:

`instrument_id + timeframe + timestamp`

Future schema work should be migration-first and validated with `EXPLAIN (ANALYZE, BUFFERS)` against representative data volumes before deployment.

## 9. Module policy

The same architecture applies to:

- Market Memory
- Pattern Search / Quality
- Scanner
- Alerts
- Replay
- Evaluation
- Cross-Market Validation
- Favorites / Watchlist
- global market search

Each module should declare its minimum required data, cache key, freshness target, foreground budget, and background work separately instead of inventing one-off loading behavior.

## 10. Observability

Set `PERFORMANCE_DEBUG=true` in development to emit request-level timings and a safe `Server-Timing` header. `PATTERN_SEARCH_PROFILE=true` additionally reports Pattern Search stage timings.

Diagnostics must remain server-side/development-only and must not expose proprietary algorithms, credentials, database details, or sensitive user information.
