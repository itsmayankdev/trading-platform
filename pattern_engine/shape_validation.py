from __future__ import annotations

import math


def directional_agreement(current_closes: list[float], historical_closes: list[float]) -> float:
    """Measure candle-to-candle directional agreement between two equal paths.

    The production V1 distance remains untouched. This is a secondary quality
    check used after V1 retrieval so a low-error path cannot receive an
    unrealistically high visual-match score when its internal direction changes
    disagree with the current pattern.
    """
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
        if abs(current_delta) <= tolerance or abs(historical_delta) <= tolerance:
            comparisons += 1
            continue

        comparisons += 1
        if (current_delta > 0) == (historical_delta > 0):
            agreements += 1

    if comparisons == 0:
        return 1.0
    return agreements / comparisons


def calibrated_similarity(base_similarity: float, agreement: float) -> float:
    """Blend V1 similarity with directional agreement without changing V1 itself."""
    score = (base_similarity * 0.70) + (agreement * 0.30)
    return max(0.0, min(1.0, score))


def passes_shape_validation(agreement: float, minimum_agreement: float = 0.60) -> bool:
    return math.isfinite(agreement) and agreement >= minimum_agreement
