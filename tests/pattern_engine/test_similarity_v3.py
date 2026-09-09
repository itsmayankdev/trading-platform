from datetime import datetime, timedelta, timezone

import pytest

from pattern_engine.algorithms.v1 import SimilarityV1
from pattern_engine.algorithms.v3 import SimilarityV3
from pattern_engine.window import CandlePoint, PatternWindow


def make_window(closes: list[float], wick_scale: float = 0.002, volume: float = 10.0) -> PatternWindow:
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    candles = tuple(
        CandlePoint(
            timestamp=start + timedelta(minutes=index),
            open=close * 0.999,
            high=close * (1.0 + wick_scale),
            low=close * (1.0 - wick_scale),
            close=close,
            volume=volume,
        )
        for index, close in enumerate(closes)
    )
    return PatternWindow(symbol="TESTUSDT", timeframe="1m", start_time=candles[0].timestamp, end_time=candles[-1].timestamp, candles=candles)


def test_identical_windows_score_one():
    window = make_window([100, 101, 99, 102, 104])
    assert SimilarityV3().score(window, window) == pytest.approx(1.0)


def test_structural_mismatch_is_not_a_perfect_close_path_match():
    close_path = [100, 101, 99, 102, 104, 103, 105]
    current = make_window(close_path, wick_scale=0.001, volume=10)
    historical = make_window(close_path, wick_scale=0.08, volume=1000)
    assert SimilarityV1().score(current, historical) == pytest.approx(1.0)
    assert SimilarityV3().score(current, historical) < 0.80


def test_price_scale_does_not_change_structural_score():
    first = make_window([100, 101, 99, 102, 104], wick_scale=0.003, volume=10)
    second = make_window([1000, 1010, 990, 1020, 1040], wick_scale=0.003, volume=10)
    assert SimilarityV3().score(first, second) == pytest.approx(1.0)


def test_mismatched_lengths_are_rejected():
    with pytest.raises(ValueError, match="Pattern lengths must match"):
        SimilarityV3().score(make_window([100, 101, 102]), make_window([100, 101, 102, 103]))
