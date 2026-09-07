from datetime import datetime, timedelta, timezone

import pytest

from pattern_engine.algorithms.v1 import SimilarityV1
from pattern_engine.window import CandlePoint, PatternWindow


def make_window(closes: list[float]) -> PatternWindow:
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    candles = tuple(
        CandlePoint(
            timestamp=start + timedelta(minutes=index),
            open=close,
            high=close,
            low=close,
            close=close,
            volume=1.0,
        )
        for index, close in enumerate(closes)
    )
    return PatternWindow(
        symbol="TESTUSDT",
        timeframe="1m",
        start_time=candles[0].timestamp,
        end_time=candles[-1].timestamp,
        candles=candles,
    )


def test_score_many_matches_scalar_score():
    algorithm = SimilarityV1()
    current = make_window([100, 101, 99, 102, 104])
    historical = [
        make_window([100, 101, 99, 102, 104]),
        make_window([100, 100, 101, 103, 105]),
        make_window([100, 98, 97, 96, 95]),
    ]

    vector_scores = algorithm.score_many(current, historical)
    scalar_scores = [
        algorithm.score(current, window)
        for window in historical
    ]

    assert vector_scores.tolist() == pytest.approx(scalar_scores)


def test_score_many_empty_input():
    algorithm = SimilarityV1()
    current = make_window([100, 101, 102])

    scores = algorithm.score_many(current, [])

    assert scores.shape == (0,)
