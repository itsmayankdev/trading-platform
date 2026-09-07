from datetime import datetime, timedelta, timezone

from backend.app.db.session import SessionLocal
from backend.app.services import MarketDataIngestionService


def main():
    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=2)

    service = MarketDataIngestionService()

    with SessionLocal() as db:
        inserted = service.ingest(
            db=db,
            symbol="ETHUSDT",
            timeframe="5m",
            start=start,
            end=end,
        )

    print(f"Inserted candles: {inserted}")


if __name__ == "__main__":
    main()
