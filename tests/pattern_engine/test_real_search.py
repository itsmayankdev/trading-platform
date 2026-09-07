from sqlalchemy import select

from backend.app.db.session import SessionLocal
from backend.app.models.candle import Candle

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

    print(f"Database candles: {len(candles)}")
    print(f"45-candle windows: {len(windows)}")

    if len(windows) < 20:
        raise RuntimeError(
            "Not enough windows for search"
        )

    current = windows[-1]

    # Only windows that ended before
    # the current pattern began are eligible.
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
    )

    print()
    print(
        f"Current pattern: "
        f"{current.start_time} → "
        f"{current.end_time}"
    )

    print()
    print("TOP MATCHES")
    print("-" * 70)

    for index, match in enumerate(
        matches,
        start=1,
    ):

        print(
            f"{index:2}. "
            f"{match.start_time} → "
            f"{match.end_time} | "
            f"Similarity: "
            f"{match.similarity_score * 100:.2f}%"
        )


if __name__ == "__main__":
    main()
