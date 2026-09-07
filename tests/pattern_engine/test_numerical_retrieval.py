from datetime import datetime, timedelta, timezone

import numpy as np

from pattern_engine.algorithms.v1 import SimilarityV1
from pattern_engine.retrieval.numerical import build_numerical_store
from pattern_engine.ranking import PatternRanker
from pattern_engine.window import CandlePoint
from pattern_engine.window_builder import build_windows


def _candles(count: int = 80) -> list[CandlePoint]:
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return [
        CandlePoint(
            timestamp=start + timedelta(minutes=5 * i),
            open=100.0 + i * 0.1,
            high=101.0 + i * 0.1,
            low=99.0 + i * 0.1,
            close=100.0 + np.sin(i / 4.0) + i * 0.03,
            volume=1000.0 + i,
        )
        for i in range(count)
    ]


def test_numerical_representation_matches_v1_scores():
    candles = _candles()
    length = 12

    windows = build_windows(
        symbol="TESTUSDT",
        timeframe="5m",
        candles=candles,
        window_length=length,
    )
    current = windows[-1]
    historical = windows[:-1]

    algorithm = SimilarityV1()
    reference = np.asarray(
        [algorithm.score(current, window) for window in historical],
        dtype=np.float64,
    )

    store = build_numerical_store(candles, length)
    current_path = store.current_normalized_path()
    matrix = store.historical_normalized_matrix()
    optimized = np.exp(
        -np.sqrt(np.mean((matrix - current_path) ** 2, axis=1)) * 10.0
    ).clip(0.0, 1.0)

    np.testing.assert_allclose(optimized, reference, rtol=1e-12, atol=1e-12)
    assert list(store.window_start_times()) == [window.start_time for window in historical]
    assert store.current_start_time() == current.start_time


def test_numerical_ranker_matches_bruteforce_ranker():
    candles = _candles(160)
    length = 12
    windows = build_windows("TESTUSDT", "5m", candles, length)
    current = windows[-1]
    historical = [window for window in windows if window.end_time < current.start_time]

    ranker = PatternRanker("similarity_v1")
    expected = ranker.rank(
        current=current,
        historical_windows=historical,
        top_k=5,
        min_separation_candles=length,
    )

    store = build_numerical_store(candles, length)
    actual = ranker.rank_numerical_v1(
        current=current,
        store=store,
        top_k=5,
        min_separation_candles=length,
    )

    assert [match.start_time for match in actual] == [match.start_time for match in expected]
    assert [match.end_time for match in actual] == [match.end_time for match in expected]
    np.testing.assert_allclose(
        [match.similarity_score for match in actual],
        [match.similarity_score for match in expected],
        rtol=1e-12,
        atol=1e-12,
    )
