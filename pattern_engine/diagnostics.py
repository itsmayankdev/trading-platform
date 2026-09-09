from __future__ import annotations

from datetime import datetime
from statistics import median


def _percentile(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * percentile
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def build_match_diagnostics(
    starts: list[datetime],
    scores: list[float],
    pattern_length: int,
    candle_interval_seconds: float,
) -> dict:
    """Describe retrieval concentration without inventing a predictive score.

    Temporal clusters are deliberately called clusters, not independent samples.
    A new cluster begins after more than two pattern spans without another match.
    This is a transparent episode-separation heuristic, not a claim of statistical
    independence.
    """
    cluster_gap = float(pattern_length * 2)
    if not starts or not scores or len(starts) != len(scores):
        return {
            "match_count": 0,
            "score": {"top": None, "median": None, "p25": None, "p75": None, "top_to_median": None},
            "temporal": {"clusters": 0, "largest_cluster": 0, "cluster_sizes": [], "distinct_days": 0, "distinct_months": 0, "median_gap_candles": None, "nearest_gap_candles": None, "cluster_gap_candles": int(cluster_gap)},
        }

    ordered = sorted(zip(starts, scores), key=lambda item: item[0])
    ordered_starts = [item[0] for item in ordered]
    gaps_candles = [
        max(0.0, (b - a).total_seconds() / max(candle_interval_seconds, 1.0))
        for a, b in zip(ordered_starts, ordered_starts[1:])
    ]

    cluster_sizes: list[int] = []
    current_size = 1
    for gap in gaps_candles:
        if gap > cluster_gap:
            cluster_sizes.append(current_size)
            current_size = 1
        else:
            current_size += 1
    cluster_sizes.append(current_size)

    top = max(scores)
    med = median(scores)
    return {
        "match_count": len(scores),
        "score": {
            "top": top,
            "median": med,
            "p25": _percentile(scores, 0.25),
            "p75": _percentile(scores, 0.75),
            "top_to_median": top - med,
        },
        "temporal": {
            "clusters": len(cluster_sizes),
            "largest_cluster": max(cluster_sizes),
            "cluster_sizes": cluster_sizes,
            "distinct_days": len({value.date() for value in ordered_starts}),
            "distinct_months": len({(value.year, value.month) for value in ordered_starts}),
            "median_gap_candles": median(gaps_candles) if gaps_candles else None,
            "nearest_gap_candles": min(gaps_candles) if gaps_candles else None,
            "cluster_gap_candles": int(cluster_gap),
        },
    }
