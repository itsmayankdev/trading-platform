from datetime import datetime, timedelta, timezone

from pattern_engine.diagnostics import build_match_diagnostics


def test_temporal_diagnostics_group_close_matches_into_clusters():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    starts = [
        start,
        start + timedelta(minutes=50),
        start + timedelta(minutes=100),
        start + timedelta(hours=8),
        start + timedelta(hours=8, minutes=50),
    ]
    result = build_match_diagnostics(
        starts=starts,
        scores=[0.98, 0.97, 0.96, 0.95, 0.94],
        pattern_length=45,
        candle_interval_seconds=300,
    )

    assert result["match_count"] == 5
    assert result["temporal"]["clusters"] == 2
    assert result["temporal"]["cluster_sizes"] == [3, 2]
    assert result["temporal"]["largest_cluster"] == 3
    assert result["score"]["top"] == 0.98
    assert result["score"]["median"] == 0.96


def test_temporal_diagnostics_do_not_claim_statistical_independence():
    result = build_match_diagnostics(
        starts=[datetime(2026, 1, 1, tzinfo=timezone.utc)],
        scores=[0.9],
        pattern_length=30,
        candle_interval_seconds=300,
    )

    assert result["temporal"]["clusters"] == 1
    assert result["temporal"]["cluster_gap_candles"] == 60
