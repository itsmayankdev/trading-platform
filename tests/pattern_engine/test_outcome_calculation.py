from datetime import datetime, timedelta, timezone

import pytest

from pattern_engine.outcomes import calculate_outcomes
from pattern_engine.window import CandlePoint, PatternWindow


def _candle(index: int, close: float, high: float, low: float) -> CandlePoint:
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return CandlePoint(
        timestamp=start + timedelta(minutes=5 * index),
        open=close,
        high=high,
        low=low,
        close=close,
        volume=1000.0,
    )


def _match(entry_price: float = 100.0) -> PatternWindow:
    candles = (_candle(0, entry_price, entry_price, entry_price),)
    return PatternWindow(
        symbol="TESTUSDT",
        timeframe="5m",
        start_time=candles[0].timestamp,
        end_time=candles[-1].timestamp,
        candles=candles,
    )


def test_calculate_outcomes_uses_exact_forward_horizons():
    future = [
        _candle(1, 101.0, 103.0, 99.0),
        _candle(2, 102.0, 105.0, 98.0),
        _candle(3, 103.0, 106.0, 97.0),
        _candle(4, 104.0, 107.0, 96.0),
        _candle(5, 105.0, 108.0, 95.0),
    ]

    outcomes = calculate_outcomes(_match(), future, horizons=(2, 5))

    assert [outcome.horizon_candles for outcome in outcomes] == [2, 5]

    first = outcomes[0]
    assert first.forward_return == pytest.approx(0.02)
    assert first.mfe == pytest.approx(0.05)
    assert first.mae == pytest.approx(-0.02)

    second = outcomes[1]
    assert second.forward_return == pytest.approx(0.05)
    assert second.mfe == pytest.approx(0.08)
    assert second.mae == pytest.approx(-0.05)


def test_calculate_outcomes_skips_horizons_without_enough_future_data():
    future = [
        _candle(1, 101.0, 102.0, 100.0),
        _candle(2, 102.0, 103.0, 99.0),
        _candle(3, 103.0, 104.0, 98.0),
    ]

    outcomes = calculate_outcomes(_match(), future, horizons=(2, 3, 5))

    assert [outcome.horizon_candles for outcome in outcomes] == [2, 3]


def test_calculate_outcomes_rejects_invalid_entry_price():
    with pytest.raises(ValueError, match="Invalid entry price"):
        calculate_outcomes(_match(entry_price=0.0), [_candle(1, 101.0, 102.0, 100.0)])


def test_calculate_outcomes_rejects_empty_match():
    empty = PatternWindow(
        symbol="TESTUSDT",
        timeframe="5m",
        start_time=datetime(2026, 1, 1, tzinfo=timezone.utc),
        end_time=datetime(2026, 1, 1, tzinfo=timezone.utc),
        candles=(),
    )

    with pytest.raises(ValueError, match="Match contains no candles"):
        calculate_outcomes(empty, [])
