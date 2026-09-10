# 2nd-update-HFDS — Supplied reference matcher

This update replaces the failed `1st-update-MNBH` strict V4 production matcher with the matching algorithm from the user's supplied `2-fast-100k-candle-engine.ts` reference source.

## Source basis

The supplied engine scans the last `WINDOW` bars of the live series against historical rolling windows. It normalizes every window independently using that window's minimum and maximum close, computes point-by-point RMSE, and converts distance to similarity with `DIST_BASE = 1.4`. It accepts candidates at or above the configured `minSim` (default 80) and below 99.5%. The source explicitly describes this as the reference engine. 

## Candidate rules

- `WINDOW = 45` by default; the UI-selected window is respected within the supported 30–45 range.
- `FOLLOW = 60` bars are required after a historical pattern.
- `MIN_GAP = 50` candles separates selected matches.
- Historical candidates must finish before the live pattern begins.
- Candidates without a complete 60-bar follow path are excluded.
- Each candidate uses its own min/max normalization.
- Distance is `sqrt(mean((candidateNormalized - liveNormalized)^2))`.
- Similarity is `(1.4 - distance) / 1.4`, bounded to 0–99.5%.
- Similarities below 80% are rejected.

The supplied source also uses a long-lived Web Worker and rolling monotonic min/max deques for high-throughput scanning. The server implementation preserves the exact normalization, RMSE, threshold, candidate-gap and follow-path semantics while evaluating numerical windows in bounded chunks.

## Why this replaces V4

V4 was an independently designed strict-gate matcher. The observed 39% result demonstrates that it did not reproduce the matching behavior wanted from the supplied reference algorithm. It is retained in the registry for comparison/rollback but is no longer production.

## Safety / rollback

- `similarity_v1` remains frozen and unchanged.
- V4 remains available as `similarity_v4` for controlled comparison.
- The active production registry points to `similarity_v5`.
