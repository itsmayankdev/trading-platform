from sqlalchemy import select

from backend.app.db.session import SessionLocal
from backend.app.models.candle import Candle

from pattern_engine.outcomes import calculate_outcomes
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

    print()
    print("HISTORICAL MATCH OUTCOMES")
    print("=" * 80)

    for index, ranked in enumerate(matches, start=1):

        matched_window = next(
            window
            for window in historical
            if window.start_time == ranked.start_time
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

        print()
        print(
            f"#{index} "
            f"{matched_window.start_time} "
            f"| Similarity: "
            f"{ranked.similarity_score * 100:.2f}%"
        )

        for outcome in outcomes:

            print(
                f"  +{outcome.horizon_candles:2} candles "
                f"| Return: "
                f"{outcome.forward_return * 100:+.2f}% "
                f"| MFE: "
                f"{outcome.mfe * 100:+.2f}% "
                f"| MAE: "
                f"{outcome.mae * 100:+.2f}%"
            )


if __name__ == "__main__":
    main()
