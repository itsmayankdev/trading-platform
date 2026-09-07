from datetime import datetime, timedelta, timezone

import pytest

from pattern_engine.algorithms.v2 import SimilarityV2
from pattern_engine.features import extract_features
from pattern_engine.window import CandlePoint, PatternWindow


def make_window(closes: list[float], volume: float = 1.0) -> PatternWindow:
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    candles = tuple(
        CandlePoint(
            timestamp=start + timedelta(minutes=index),
            open=close * 0.999,
            high=close * 1.002,
            low=close * 0.998,
            close=close,
            volume=volume,
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


def test_identical_windows_score_one():
    algorithm = SimilarityV2()
    window = make_window([100, 101, 99, 102, 104], volume=10)

    assert algorithm.score(window, window) == pytest.approx(1.0)


def test_score_many_matches_scalar_score():
    algorithm = SimilarityV2()
    current = make_window([100, 101, 99, 102, 104], volume=10)
    historical = [
        make_window([100, 101, 99, 102, 104], volume=10),
        make_window([100, 100, 101, 103, 105], volume=20),
        make_window([100, 98, 97, 96, 95], volume=5),
    ]

    vector_scores = algorithm.score_many(current, historical)
    scalar_scores = [algorithm.score(current, window) for window in historical]

    assert vector_scores.tolist() == pytest.approx(scalar_scores)
    assert vector_scores[0] == pytest.approx(1.0)


def test_features_are_scale_invariant_for_price():
    first = make_window([100, 101, 99, 102], volume=10)
    second = make_window([1000, 1010, 990, 1020], volume=10)

    first_features = extract_features(first)
    second_features = extract_features(second)

    assert first_features.close_path == pytest.approx(second_features.close_path)
    assert first_features.returns == pytest.approx(second_features.returns)
    assert first_features.candle_structure == pytest.approx(second_features.candle_structure)


def test_mismatched_lengths_are_rejected():
    algorithm = SimilarityV2()
    current = make_window([100, 101, 102])
    historical = make_window([100, 101, 102, 103])

    with pytest.raises(ValueError, match="Pattern lengths must match"):
        algorithm.score(current, historical)
