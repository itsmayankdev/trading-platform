from sqlalchemy import select

from backend.app.db.session import SessionLocal
from backend.app.models.candle import Candle

from pattern_engine.outcomes import calculate_outcomes
from pattern_engine.statistics import calculate_statistics
from pattern_engine.window import CandlePoint
from pattern_engine.window_builder import build_windows
from pattern_engine.ranking import PatternRanker


def main():

    with SessionLocal() as db:

        rows = db.execute(
            select(Candle)
            .where(
                Candle.instrument_id == 1,
                Candle.timeframe == "5m",
            )
            .order_by(Candle.timestamp.asc())
        ).scalars().all()

    candles = [
        CandlePoint(
            timestamp=row.timestamp,
            open=row.open,
            high=row.high,
            low=row.low,
            close=row.close,
            volume=row.volume,
        )
        for row in rows
    ]

    windows = build_windows(
        symbol="ETHUSDT",
        timeframe="5m",
        candles=candles,
        window_length=45,
    )

    current = windows[-1]

    historical = [
        window
        for window in windows
        if window.end_time < current.start_time
    ]

    ranker = PatternRanker()

    matches = ranker.rank(
        current=current,
        historical_windows=historical,
        top_k=10,
        min_separation_candles=45,
    )

    all_outcomes = []

    for ranked in matches:

        matched_window = next(
            window
            for window in historical
            if window.start_time
            == ranked.start_time
        )

        future = [
            candle
            for candle in candles
            if candle.timestamp
            > matched_window.end_time
        ]

        outcomes = calculate_outcomes(
            match=matched_window,
            future_candles=future,
        )

        all_outcomes.extend(outcomes)

    statistics = calculate_statistics(
        all_outcomes
    )

    print()
    print("AGGREGATE HISTORICAL OUTCOMES")
    print("=" * 90)

    print(
        f"{'Horizon':<10}"
        f"{'Samples':<10}"
        f"{'Mean':<12}"
        f"{'Median':<12}"
        f"{'Win Rate':<12}"
        f"{'Avg MFE':<12}"
        f"{'Avg MAE':<12}"
    )

    print("-" * 90)

    for stat in statistics:

        print(
            f"+{stat.horizon_candles:<9}"
            f"{stat.sample_size:<10}"
            f"{stat.mean_return * 100:+.2f}%    "
            f"{stat.median_return * 100:+.2f}%    "
            f"{stat.win_rate * 100:.1f}%       "
            f"{stat.mean_mfe * 100:+.2f}%    "
            f"{stat.mean_mae * 100:+.2f}%"
        )


if __name__ == "__main__":
    main()
