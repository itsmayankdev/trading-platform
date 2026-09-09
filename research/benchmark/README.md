# Algorithm Benchmark Lab

Experimental only. This directory is not imported by production code.

Purpose: compare the two candidate engines supplied for this project against the existing production V1 without modifying production behavior.

## Candidates

- `historical-matching-candidate.ts`: historical matching / verification candidate.
- `fast-100k-candle-candidate.ts`: compact 100k-candle scan candidate.

## Benchmark contract

Use the same OHLCV dataset, symbol, timeframe, pattern length, minimum similarity, and match count for every candidate.

Record separately:

1. data load time
2. scan time
3. historical match/verification time
4. total time
5. number of matches
6. match timestamps and similarity scores

Do not promote a candidate based on speed alone. Result parity with production V1 must be evaluated before any integration decision.

The production algorithm and `docs/search-algorithm.md` remain frozen.
