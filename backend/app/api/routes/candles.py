from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from backend.app.auth.user_auth import require_permission, require_user
from backend.app.db.session import get_db
from backend.app.repositories.candle import CandleRepository
from backend.app.repositories.instrument import InstrumentRepository
from workers.ingestion.on_demand import ensure_market_data, refresh_latest_market_candle
from workers.ingestion.yahoo_on_demand import ensure_yahoo_market_data

router = APIRouter(prefix="/api/v1", tags=["candles"])
candle_repository = CandleRepository()
instrument_repository = InstrumentRepository()


@router.get("/candles")
def get_candles(
    request: Request,
    symbol: str = Query(default="ETHUSDT", min_length=1, max_length=50),
    timeframe: str = Query(default="5m", min_length=1, max_length=10),
    limit: int = Query(default=500, ge=1, le=5000),
    start_time: datetime | None = Query(default=None),
    end_time: datetime | None = Query(default=None),
    db: Session = Depends(get_db),
):
    user = require_user(request, db)
    require_permission(user, "market_memory.view")
    symbol, timeframe = symbol.upper(), timeframe.lower()
    if start_time is not None and end_time is not None and start_time > end_time:
        raise HTTPException(status_code=400, detail="start_time must be before end_time")
    instrument = instrument_repository.get_by_symbol(db=db, symbol=symbol)
    if instrument is None:
        raise HTTPException(status_code=404, detail=f"Instrument not found: {symbol}")

    try:
        # Live chart requests have no time bounds. Refresh only the currently
        # forming Binance candle so the live chart follows the live quote.
        if start_time is None and end_time is None and instrument.provider == "binance":
            refresh_latest_market_candle(symbol=symbol, timeframe=timeframe)

        # Historical requests are bounded and immutable. Query the requested
        # window first so a small match chart never scans the latest 1000 rows
        # just to decide whether its bounded data already exists.
        candles = candle_repository.get_candles(
            db=db,
            instrument_id=instrument.id,
            timeframe=timeframe,
            limit=limit,
            start_time=start_time,
            end_time=end_time,
        )
        required = min(limit, 1000)
        if len(candles) < required:
            db.expire_all()
            if instrument.provider == "yahoo":
                ensure_yahoo_market_data(
                    symbol=symbol,
                    timeframe=timeframe,
                    minimum_candles=required,
                )
            elif (
                instrument.exchange == "binance"
                and instrument.provider == "binance"
                and instrument.is_listed
                and instrument.is_spot_trading_allowed
            ):
                ensure_market_data(
                    symbol=symbol,
                    timeframe=timeframe,
                    minimum_candles=required,
                )
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported market provider: {instrument.provider}",
                )
            db.expire_all()
            candles = candle_repository.get_candles(
                db=db,
                instrument_id=instrument.id,
                timeframe=timeframe,
                limit=limit,
                start_time=start_time,
                end_time=end_time,
            )
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        print(f"On-demand candle warmup skipped for {symbol} {timeframe}: {exc}", flush=True)
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
        "provider": instrument.provider,
        "candles": [
            {
                "time": int(c.timestamp.timestamp()),
                "open": c.open,
                "high": c.high,
                "low": c.low,
                "close": c.close,
                "volume": c.volume,
            }
            for c in candles
        ],
    }
