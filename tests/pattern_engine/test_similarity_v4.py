from datetime import datetime, timedelta

import numpy as np

from pattern_engine.algorithms.v4 import SimilarityV4
from pattern_engine.window import CandlePoint, PatternWindow


def make_window(closes: list[float]) -> PatternWindow:
    candles = tuple(
        CandlePoint(
            timestamp=datetime(2026, 1, 1) + timedelta(minutes=i),
            open=value,
            high=value * 1.001,
            low=value * 0.999,
            close=value,
            volume=1.0,
        )
        for i, value in enumerate(closes)
    )
    return PatternWindow(
        symbol="TEST",
        timeframe="5m",
        start_time=candles[0].timestamp,
        end_time=candles[-1].timestamp,
        candles=candles,
    )


def test_v4_near_identical_shape_scores_high():
    current = make_window([100, 102, 101, 104, 103, 106, 105, 108])
    historical = make_window([200, 204, 202, 208, 206, 212, 210, 216])

    score = SimilarityV4().score(current, historical)

    assert score > 0.90


def test_v4_rejects_similar_endpoint_but_wrong_direction_sequence():
    current = make_window([100, 102, 101, 104, 103, 106, 105, 108])
    wrong = make_window([200, 198, 201, 199, 202, 200, 204, 216])

    score = SimilarityV4().score(current, wrong)

    assert score == 0.0


def test_v4_hard_gate_rejects_large_path_error_even_with_positive_correlation():
    current_path = np.linspace(0.0, 0.01, 8)
    historical_path = np.linspace(0.0, 0.08, 8)

    scores = SimilarityV4.score_paths(current_path, historical_path[None, :])

    assert scores[0] == 0.0
