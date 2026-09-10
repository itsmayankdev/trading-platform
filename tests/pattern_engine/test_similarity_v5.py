from datetime import datetime, timedelta

from pattern_engine.algorithms.v5 import SimilarityV5
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
    return PatternWindow("TEST", "5m", candles[0].timestamp, candles[-1].timestamp, candles)


def test_reference_minmax_match_is_high_for_same_shape():
    current = make_window([100, 102, 101, 104, 103, 106, 105, 108])
    historical = make_window([200, 204, 202, 208, 206, 212, 210, 216])
    assert SimilarityV5().score(current, historical) > 0.99


def test_reference_minmax_score_is_zero_below_80_percent_threshold():
    current = make_window([100, 110, 100, 110, 100, 110, 100, 110])
    historical = make_window([200, 201, 202, 203, 204, 205, 206, 207])
    assert SimilarityV5().score(current, historical) == 0.0


def test_reference_engine_caps_similarity_below_99_5_percent():
    current = make_window([100, 102, 104, 103, 106, 108, 107, 110])
    historical = make_window([500, 510, 520, 515, 530, 540, 535, 550])
    assert SimilarityV5().score(current, historical) <= 0.995
