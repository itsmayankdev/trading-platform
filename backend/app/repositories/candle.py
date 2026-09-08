from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from backend.app.models.candle import Candle


class CandleRepository:

    def insert_many(
        self,
        db: Session,
        instrument_id: int,
        timeframe: str,
        candles: list,
    ) -> int:
        if not candles:
            return 0

        rows = [
            {
                "instrument_id": instrument_id,
                "timeframe": timeframe,
                "timestamp": candle.timestamp,
                "open": candle.open,
                "high": candle.high,
                "low": candle.low,
                "close": candle.close,
                "volume": candle.volume,
            }
            for candle in candles
        ]

        statement = (
            insert(Candle)
            .values(rows)
            .on_conflict_do_nothing(
                constraint="uq_candle_instrument_timeframe_timestamp"
            )
            .returning(Candle.id)
        )

        result = db.execute(statement)
        inserted_ids = result.scalars().all()
        return len(inserted_ids)

    def get_candles(
        self,
        db: Session,
        instrument_id: int,
        timeframe: str,
        limit: int = 500,
        start_time=None,
        end_time=None,
    ) -> list[Candle]:
        statement = select(Candle).where(
            Candle.instrument_id == instrument_id,
            Candle.timeframe == timeframe,
        )

        if start_time is not None:
            statement = statement.where(Candle.timestamp >= start_time)

        if end_time is not None:
            statement = statement.where(Candle.timestamp <= end_time)

        statement = statement.order_by(Candle.timestamp.desc()).limit(limit)
        candles = db.execute(statement).scalars().all()
        return list(reversed(candles))

    def get_time_range(
        self,
        db: Session,
        instrument_id: int,
        timeframe: str,
    ) -> tuple:
        statement = select(
            func.min(Candle.timestamp),
            func.max(Candle.timestamp),
        ).where(
            Candle.instrument_id == instrument_id,
            Candle.timeframe == timeframe,
        )
        return db.execute(statement).one()
