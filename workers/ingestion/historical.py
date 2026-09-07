from datetime import datetime, timedelta, timezone

from backend.app.db.session import SessionLocal
from backend.app.models.ingestion import IngestionJob
from backend.app.repositories.candle import CandleRepository
from backend.app.repositories.ingestion import IngestionRepository
from backend.app.repositories.instrument import InstrumentRepository
from market_data.providers.binance import BinanceProvider
from market_data.quality.validator import CandleValidator
from market_data.timeframes.utils import (
    TIMEFRAME_MINUTES,
    floor_to_timeframe,
    timeframe_delta,
)


class HistoricalDownloader:

    def __init__(self):
        self.provider = BinanceProvider()
        self.validator = CandleValidator()
        self.instrument_repository = InstrumentRepository()
        self.candle_repository = CandleRepository()
        self.ingestion_repository = IngestionRepository()

    def download(
        self,
        symbol: str,
        timeframe: str,
        start: datetime,
        end: datetime,
    ) -> int:
        """Create and execute a new ingestion job."""
        symbol = symbol.upper()
        start, end = self._validate_range(symbol, timeframe, start, end)

        with SessionLocal() as db:
            job = self.ingestion_repository.create(
                db=db,
                symbol=symbol,
                timeframe=timeframe,
                start_time=start,
                end_time=end,
            )
            db.commit()
            job_id = job.id

        return self._run_job(job_id)

    def _validate_range(self, symbol, timeframe, start, end):
        if timeframe not in TIMEFRAME_MINUTES:
            raise ValueError(f"Unsupported timeframe: {timeframe}")
        if start.tzinfo is None or end.tzinfo is None:
            raise ValueError("start and end must be timezone-aware")
        if start >= end:
            raise ValueError("start must be before end")

        start = floor_to_timeframe(start, timeframe)
        end = floor_to_timeframe(end, timeframe)
        if start >= end:
            raise ValueError("time range is empty after timeframe normalization")
        return start, end

    def run_job(self, job_id: int) -> int:
        """Execute an existing queued/running job from its persisted cursor."""
        with SessionLocal() as db:
            job = self.ingestion_repository.get(db, job_id)
            if job is None:
                raise ValueError(f"Ingestion job {job_id} not found")
            if job.status not in {"queued", "running"}:
                raise ValueError(
                    f"Ingestion job {job_id} has status '{job.status}' and cannot run"
                )
            job.status = "running"
            job.updated_at = datetime.now(timezone.utc)
            db.commit()

        return self._run_job(job_id)

    def _run_job(self, job_id: int) -> int:
        total_inserted = 0

        with SessionLocal() as db:
            job = self.ingestion_repository.get(db, job_id)
            if job is None:
                raise ValueError(f"Ingestion job {job_id} not found")
            symbol = job.symbol.upper()
            timeframe = job.timeframe
            cursor = job.cursor_time
            end = job.end_time

        candle_delta = timeframe_delta(timeframe)

        try:
            while cursor < end:
                batch_end = min(
                    cursor + timedelta(minutes=TIMEFRAME_MINUTES[timeframe] * 1000),
                    end,
                )

                print(f"\nDownloading {symbol} {timeframe}:")
                print(f"  {cursor.isoformat()} → {batch_end.isoformat()}")

                candles = self.provider.get_candles(
                    symbol=symbol,
                    timeframe=timeframe,
                    start=cursor,
                    end=batch_end,
                )

                now = datetime.now(timezone.utc)
                candles = [
                    candle
                    for candle in candles
                    if candle.timestamp + candle_delta <= now
                ]

                if not candles:
                    print("No completed candles returned.")
                    break

                validation = self.validator.validate(
                    candles=candles,
                    timeframe_minutes=TIMEFRAME_MINUTES[timeframe],
                )
                if not validation.valid:
                    raise RuntimeError(
                        "Candle validation failed:\n" + "\n".join(validation.errors)
                    )

                with SessionLocal() as db:
                    instrument = self.instrument_repository.get_or_create(
                        db=db,
                        symbol=symbol,
                        asset_class="crypto",
                        exchange="binance",
                        provider="binance",
                    )
                    inserted = self.candle_repository.insert_many(
                        db=db,
                        instrument_id=instrument.id,
                        timeframe=timeframe,
                        candles=candles,
                    )

                    last_timestamp = candles[-1].timestamp
                    next_cursor = last_timestamp + candle_delta
                    job = self.ingestion_repository.get(db, job_id)
                    if job is None:
                        raise RuntimeError(f"Ingestion job {job_id} disappeared")
                    self.ingestion_repository.update(
                        db=db,
                        job=job,
                        cursor_time=next_cursor,
                        received=len(candles),
                        inserted=inserted,
                    )
                    db.commit()

                total_inserted += inserted
                print(f"  Received: {len(candles)}")
                print(f"  Inserted: {inserted}")
                print(f"  Total inserted: {total_inserted}")

                if next_cursor <= cursor:
                    raise RuntimeError("Downloader cursor did not advance")
                cursor = next_cursor

            with SessionLocal() as db:
                job = self.ingestion_repository.get(db, job_id)
                if job:
                    self.ingestion_repository.complete(db, job)
                    db.commit()

            return total_inserted

        except Exception as exc:
            with SessionLocal() as db:
                job = self.ingestion_repository.get(db, job_id)
                if job:
                    self.ingestion_repository.fail(db, job, str(exc))
                    db.commit()
            raise


def main():
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=7)
    inserted = HistoricalDownloader().download(
        symbol="ETHUSDT",
        timeframe="5m",
        start=start,
        end=end,
    )
    print("\nHistorical download complete.")
    print(f"Inserted: {inserted}")


if __name__ == "__main__":
    main()
