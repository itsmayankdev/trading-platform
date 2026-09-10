# 1st-update-MNBH — Strict pattern matching

## Goal

Reduce false high-confidence matches where the old V1 close-path RMSE could report 98%+ similarity even when the candle sequence did not look nearly identical on the chart.

## Production contract

- `similarity_v1` is frozen and unchanged.
- `similarity_v4` is the active matcher for this update.
- The update is reversible through the central algorithm registry.
- No future algorithm change may silently alter V1.

## Strict scoring logic

V4 works on the normalized close path, so absolute price level does not matter.

A candidate must pass **all** hard gates:

1. Path RMSE <= 2.0% normalized-price units.
2. Maximum point-by-point path deviation <= 5.0%.
3. Pearson path correlation >= 0.80.
4. Candle-to-candle direction agreement >= 70%.

Failure of any gate produces a similarity of exactly `0%`; a weak candidate is not allowed to masquerade as a high-confidence match.

For candidates that pass, the score combines four bounded components:

- path shape error: 1 - RMSE / 0.020
- path correlation: normalized from 0.80 to 1.00
- direction agreement: normalized from 0.70 to 1.00
- six evenly spaced anchor errors: normalized using the same 2.0% tolerance

The final score is the geometric mean of those components. This makes one weak structural dimension materially reduce the final score instead of being hidden by stronger dimensions.

## Retrieval

The numerical search path evaluates candidates in bounded chunks, so strict scoring does not require constructing millions of Python candle objects or one giant feature matrix.

## Historical chart highlight

The historical highlight now uses the matched first and last candle coordinates plus half-candle spacing on both sides. This means a 30-candle match visually covers exactly those 30 candle slots rather than stopping at the centers of the first/last candles.

## Acceptance criteria

- A visually near-identical normalized path can score above 90%.
- A candidate with similar endpoints but materially different directional sequence is rejected.
- A candidate with large path error is rejected even when its broad trend correlation is positive.
- The UI highlight covers exactly `patternLength` candles.
- V1 source remains unchanged.
