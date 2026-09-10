# V2 Reference Algorithm Backup — 2nd-update-HFDS

This is the permanent backup record for the matching algorithm introduced as `2nd-update-HFDS`.

## Origin

Based on the user's supplied `2-fast-100k-candle-engine.ts` reference matcher.

## Core behavior preserved

- Independent min/max normalization for each candidate window.
- Point-by-point normalized close-path RMSE.
- `DIST_BASE = 1.4`.
- Minimum similarity threshold of `80%`.
- Maximum similarity of `99.5%`.
- `FOLLOW_BARS = 60`.
- Candidate separation of `50` candles in the production retrieval path.

## Repository mapping

- Active implementation: `pattern_engine/algorithms/v5.py` (`similarity_v5`).
- Permanent V2 backup implementation: `pattern_engine/algorithms/backups/v2_reference.py` (`similarity_v2_reference`).
- Update record: `docs/algorithm-updates/2nd-update-HFDS.md`.

## Important

This backup is for future reference, comparison, and restoration. Do not silently modify or overwrite it during later algorithm experiments.

V1 remains separately frozen and must never be altered.
