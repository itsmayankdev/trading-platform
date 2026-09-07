from datetime import datetime, timedelta, timezone

import numpy as np

from pattern_engine.retrieval.numerical import NumericalWindowStore


def _closes(count: int, pattern_length: int) -> list[float]:
    """Make the current pattern repeat the immediately preceding pattern."""
    prefix = [100.0 + i * 0.2 for i in range(count - pattern_length)]
    pattern = [110.0 + np.sin(i / 3.0) * 2.0 for i in range(pattern_length)]
    return prefix + pattern


def test_rank_v1_never_returns_overlapping_current_window():
    pattern_length = 12
    closes = _closes(80, pattern_length)
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    timestamps = [start + timedelta(minutes=5 * i) for i in range(len(closes))]

    store = NumericalWindowStore.from_columns(
        timestamps=timestamps,
        closes=closes,
        window_length=pattern_length,
    )
    current_start = store.current_start_time()

    matches = store.rank_v1(
        current_start_time=current_start,
        top_k=20,
        min_separation_candles=pattern_length,
    )

    assert matches

    for start_index, _score in matches:
        candidate_end_index = start_index + pattern_length - 1
        assert timestamps[candidate_end_index] < current_start

    # The immediately preceding overlapping windows are intentionally made
    # attractive; none may leak into the historical result set.
    current_start_index = len(closes) - pattern_length
    assert all(
        start_index <= current_start_index - pattern_length
        for start_index, _ in matches
    )
