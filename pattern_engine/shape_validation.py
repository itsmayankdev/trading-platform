from __future__ import annotations

import math


def _normalize_to_range(values: list[float]) -> list[float]:
    low = min(values)
    high = max(values)
    span = high - low
    if span <= 1e-12:
        return [0.0] * len(values)
    return [(value - low) / span for value in values]


def directional_agreement(current_closes: list[float], historical_closes: list[float]) -> float:
    """Measure candle-to-candle directional agreement between two equal paths."""
    if len(current_closes) != len(historical_closes) or len(current_closes) < 2:
        return 0.0

    agreements = 0
    comparisons = 0
    for current_a, current_b, historical_a, historical_b in zip(
        current_closes,
        current_closes[1:],
        historical_closes,
        historical_closes[1:],
    ):
        current_delta = current_b - current_a
        historical_delta = historical_b - historical_a
        scale = max(abs(current_a), abs(current_b), abs(historical_a), abs(historical_b), 1e-12)
        tolerance = scale * 1e-7

        if abs(current_delta) <= tolerance and abs(historical_delta) <= tolerance:
            continue
        comparisons += 1
        if abs(current_delta) > tolerance and abs(historical_delta) > tolerance:
            if (current_delta > 0) == (historical_delta > 0):
                agreements += 1

    if comparisons == 0:
        return 1.0
    return agreements / comparisons


def path_shape_similarity(current_closes: list[float], historical_closes: list[float]) -> float:
    """Compare turning shape independently of absolute price and overall range.

    Min/max normalization prevents a price-level difference from dominating the
    check. The score combines path correlation with point-by-point normalized
    error, so two paths that merely share the same broad direction do not pass
    as strong visual matches.
    """
    if len(current_closes) != len(historical_closes) or len(current_closes) < 2:
        return 0.0

    current = _normalize_to_range(current_closes)
    historical = _normalize_to_range(historical_closes)

    current_mean = sum(current) / len(current)
    historical_mean = sum(historical) / len(historical)
    numerator = sum((a - current_mean) * (b - historical_mean) for a, b in zip(current, historical))
    current_var = sum((a - current_mean) ** 2 for a in current)
    historical_var = sum((b - historical_mean) ** 2 for b in historical)

    if current_var <= 1e-12 or historical_var <= 1e-12:
        correlation = 1.0 if max(abs(a - b) for a, b in zip(current, historical)) <= 0.05 else 0.0
    else:
        correlation = numerator / math.sqrt(current_var * historical_var)
        correlation = max(-1.0, min(1.0, correlation))
        correlation = (correlation + 1.0) / 2.0

    mean_absolute_error = sum(abs(a - b) for a, b in zip(current, historical)) / len(current)
    error_score = max(0.0, 1.0 - mean_absolute_error)
    return max(0.0, min(1.0, (correlation * 0.60) + (error_score * 0.40)))


def calibrated_similarity(base_similarity: float, agreement: float, shape_similarity: float) -> float:
    """Blend V1 similarity with independent shape checks without changing V1."""
    score = (base_similarity * 0.60) + (agreement * 0.20) + (shape_similarity * 0.20)
    return max(0.0, min(1.0, score))


def passes_shape_validation(
    agreement: float,
    shape_similarity: float,
    minimum_agreement: float = 0.65,
    minimum_shape_similarity: float = 0.65,
) -> bool:
    return (
        math.isfinite(agreement)
        and math.isfinite(shape_similarity)
        and agreement >= minimum_agreement
        and shape_similarity >= minimum_shape_similarity
    )
