# Search Algorithm — FROZEN REFERENCE

> **DO NOT MODIFY THIS FILE.**
>
> This document is the preserved reference for the production historical-pattern search algorithm as of September 2026. It is intentionally not imported by the application and must never become a runtime dependency. Future algorithm experiments, optimizations, or replacements must be implemented separately and must not alter this reference.

## Production algorithm

**Algorithm version:** `similarity_v1`  
**Feature version:** `close_path_v1`

The production search compares the current pattern with historical windows using the normalized closing-price path only.

### 1. Close-path normalization

For each pattern window, normalize every close relative to the first close in that window:

```text
normalized[i] = close[i] / close[0] - 1
```

This removes the absolute price level and compares the shape/path of the close series.

### 2. Distance

For the current normalized path `C` and a historical normalized path `H`, calculate root mean squared distance:

```text
MSE = mean((C - H)^2)
distance = sqrt(MSE)
```

### 3. Similarity score

Convert distance to a bounded similarity score:

```text
similarity = exp(-distance * 10)
similarity = clip(similarity, 0, 1)
```

The UI expresses this value as a percentage.

### 4. Historical candidate windows

For a pattern length `N`, the historical data is treated as overlapping windows of `N` candles.

The current window is excluded. Historical windows must end before the current pattern start time.

### 5. Ranking

Historical windows are ranked by the V1 similarity score in descending order.

The search returns up to the requested `top_k` matches.

### 6. Minimum separation

The default minimum separation is the pattern length itself.

For regularly spaced candles:

```text
minimum_separation = candle_spacing * pattern_length
```

A candidate is rejected when its start time is closer than this separation to an already selected match.

This prevents highly overlapping historical windows from consuming the result set.

### 7. Stable ordering

Ranking uses a stable descending sort. This preserves deterministic ordering for equal scores.

### 8. Performance implementation

The production numerical retrieval path uses `NumericalWindowStore` and processes normalized historical windows in bounded chunks rather than allocating one giant normalized matrix for long histories.

The chunking is a memory optimization only. It preserves the V1 score definition and ranking semantics.

Current production implementation references preserved at creation of this file:

- `pattern_engine/algorithms/v1.py`
- `pattern_engine/ranking.py`
- `pattern_engine/retrieval/numerical.py`
- `pattern_engine/registry.py`

## Frozen production behavior

The following must remain true unless a deliberate future algorithm migration is approved separately:

- Production algorithm remains `similarity_v1`.
- Production feature representation remains `close_path_v1`.
- Only normalized close-path shape is used for the V1 similarity score.
- The distance-to-similarity formula remains `exp(-distance * 10)` with `[0, 1]` clipping.
- Current pattern is excluded from historical candidates.
- Minimum separation remains pattern-length based by default.
- V1 ranking remains deterministic/stable.
- Performance optimizations must not change V1 scores or ordering semantics.
- Experimental algorithms such as V2/V3 must not replace V1 implicitly.

## Reference implementation snapshot

The essential V1 scoring logic is preserved here as a non-runtime reference:

```python
current_path = normalize_close_path(current)
historical_path = normalize_close_path(historical)

distance = float(
    np.sqrt(
        np.mean((current_path - historical_path) ** 2)
    )
)

similarity = max(0.0, min(1.0, math.exp(-distance * 10.0)))
```

The vectorized multi-window implementation is mathematically equivalent:

```python
current_path = normalize_close_path(current)
historical_paths = np.asarray(
    [normalize_close_path(window) for window in historical_windows],
    dtype=np.float64,
)

distances = np.sqrt(
    np.mean((historical_paths - current_path) ** 2, axis=1)
)

scores = np.exp(-distances * 10.0).clip(0.0, 1.0)
```

The long-history retrieval path applies the same formula in bounded chunks and performs a stable descending sort before minimum-separation selection.

## Change policy

**This file is a historical reference and is frozen.**

Do not edit it during performance work, UI work, data-provider work, refactoring, or future algorithm experiments.

If a new search algorithm is developed, create a new separately named version/reference and explicitly select it for research or evaluation. Never silently overwrite this reference or change the production algorithm as a side effect of unrelated work.
