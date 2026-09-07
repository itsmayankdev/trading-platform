from datetime import datetime

from sqlalchemy.orm import Session

from backend.app.repositories.candle import CandleRepository
from backend.app.repositories.instrument import InstrumentRepository
from market_data.providers.binance import BinanceProvider


class MarketDataIngestionService:

    def __init__(self):
        self.provider = BinanceProvider()
        self.instrument_repository = InstrumentRepository()
        self.candle_repository = CandleRepository()

    def ingest(
        self,
        db: Session,
        symbol: str,
        timeframe: str,
        start: datetime,
        end: datetime,
    ) -> int:

        candles = self.provider.get_candles(
            symbol=symbol,
            timeframe=timeframe,
            start=start,
            end=end,
        )

        instrument = self.instrument_repository.get_or_create(
            db=db,
            symbol=symbol.upper(),
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

        db.commit()

        return inserted
