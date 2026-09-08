from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.repositories.candle import CandleRepository
from backend.app.repositories.instrument import InstrumentRepository


router = APIRouter(prefix="/api/v1", tags=["candles"])
candle_repository = CandleRepository()
instrument_repository = InstrumentRepository()


@router.get("/candles")
def get_candles(
    symbol: str = Query(default="ETHUSDT", min_length=1, max_length=50),
    timeframe: str = Query(default="5m", min_length=1, max_length=10),
    limit: int = Query(default=500, ge=1, le=5000),
    start_time: datetime | None = Query(default=None),
    end_time: datetime | None = Query(default=None),
    db: Session = Depends(get_db),
):
    symbol = symbol.upper()
    timeframe = timeframe.lower()

    if start_time is not None and end_time is not None and start_time > end_time:
        raise HTTPException(status_code=400, detail="start_time must be before end_time")

    instrument = instrument_repository.get_by_symbol(db=db, symbol=symbol)
    if instrument is None:
        raise HTTPException(status_code=404, detail=f"Instrument not found: {symbol}")

    candles = candle_repository.get_candles(
        db=db,
        instrument_id=instrument.id,
        timeframe=timeframe,
        limit=limit,
        start_time=start_time,
        end_time=end_time,
    )
    available_start, available_end = candle_repository.get_time_range(
        db=db,
        instrument_id=instrument.id,
        timeframe=timeframe,
    )

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "count": len(candles),
        "available_start_time": available_start.isoformat() if available_start else None,
        "available_end_time": available_end.isoformat() if available_end else None,
        "candles": [
            {
                "time": int(candle.timestamp.timestamp()),
                "open": candle.open,
                "high": candle.high,
                "low": candle.low,
                "close": candle.close,
                "volume": candle.volume,
            }
            for candle in candles
        ],
    }
