from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from backend.app.auth.user_auth import require_permission, require_user
from backend.app.db.session import get_db
from backend.app.repositories.candle import CandleRepository
from backend.app.repositories.instrument import InstrumentRepository
from market_data.interface import Candle as MarketCandle
from market_data.providers.binance import BinanceProvider
from backend.app.services.market_state import MarketStateService
from workers.ingestion.on_demand import ensure_market_data, refresh_latest_market_candle
from workers.ingestion.yahoo_on_demand import ensure_yahoo_market_data

router = APIRouter(prefix="/api/v1", tags=["candles"])
candle_repository = CandleRepository()
instrument_repository = InstrumentRepository()


def _latest_candle_state(db: Session, instrument_id: int, symbol: str, timeframe: str) -> dict | None:
    rows = candle_repository.get_candles(
        db=db,
        instrument_id=instrument_id,
        timeframe=timeframe,
        limit=1,
    )
    if not rows:
        return None
    candle = rows[-1]
    return {
        "time": int(candle.timestamp.replace(tzinfo=timezone.utc).timestamp()),
        "open": candle.open,
        "high": candle.high,
        "low": candle.low,
        "close": candle.close,
        "volume": candle.volume,
    }


def _refresh_and_read_latest(
    db: Session,
    instrument_id: int,
    symbol: str,
    timeframe: str,
) -> dict | None:
    refresh_latest_market_candle(symbol=symbol, timeframe=timeframe)
    db.expire_all()
    return _latest_candle_state(db, instrument_id, symbol, timeframe)


def _normalize_db_datetime(value: datetime | None) -> datetime | None:
    """Normalize API datetimes to the UTC-naive form used by candle storage."""
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _load_exact_binance_window(
    db: Session,
    instrument_id: int,
    symbol: str,
    timeframe: str,
    start_time: datetime,
    end_time: datetime,
) -> list:
    """Fetch only the missing historical window and persist it before reading again."""
    provider_start = start_time.replace(tzinfo=timezone.utc)
    provider_end = end_time.replace(tzinfo=timezone.utc)
    if provider_start >= provider_end:
        return []

    candles = BinanceProvider().get_candles(
        symbol=symbol,
        timeframe=timeframe,
        start=provider_start,
        end=provider_end,
    )
    if not candles:
        return []

    normalized = [
        MarketCandle(
            timestamp=candle.timestamp.astimezone(timezone.utc).replace(tzinfo=None),
            open=candle.open,
            high=candle.high,
            low=candle.low,
            close=candle.close,
            volume=candle.volume,
        )
        for candle in candles
    ]

    # Persistence is best-effort for a chart read. The historical chart must
    # still render if the database write/constraint is temporarily unhealthy.
    try:
        candle_repository.insert_many(
            db=db,
            instrument_id=instrument_id,
            timeframe=timeframe,
            candles=normalized,
        )
        db.commit()
        db.expire_all()
        stored = candle_repository.get_candles(
            db=db,
            instrument_id=instrument_id,
            timeframe=timeframe,
            limit=5000,
            start_time=start_time,
            end_time=end_time,
        )
        if stored:
            return stored
    except Exception as persistence_error:
        db.rollback()
        print(
            f"Historical candle persistence skipped for {symbol} {timeframe}: {persistence_error}",
            flush=True,
        )

    return normalized


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

    # Candle timestamps are stored as UTC-naive PostgreSQL timestamps. FastAPI
    # may parse browser ISO timestamps as timezone-aware values (especially when
    # a trailing Z is present), so normalize the bounded historical window
    # before validation or SQLAlchemy compares it with the candle column.
    start_time = _normalize_db_datetime(start_time)
    end_time = _normalize_db_datetime(end_time)

    if start_time is not None and end_time is not None and start_time > end_time:
        raise HTTPException(status_code=400, detail="start_time must be before end_time")

    instrument = instrument_repository.get_by_symbol(db=db, symbol=symbol)
    if instrument is None:
        raise HTTPException(status_code=404, detail=f"Instrument not found: {symbol}")

    try:
        # Live chart requests use a shared Redis state/refresh coordinator.
        # Only the lock owner can call Binance; contending requests use the same
        # cached state or fall back to PostgreSQL without calling the provider.
        latest_market_state = None
        if start_time is None and end_time is None and instrument.provider == "binance":
            refresh_result = MarketStateService.get_or_refresh(
                symbol=symbol,
                timeframe=timeframe,
                refresh=lambda: _refresh_and_read_latest(
                    db=db,
                    instrument_id=instrument.id,
                    symbol=symbol,
                    timeframe=timeframe,
                ),
                fallback=lambda: _latest_candle_state(
                    db=db,
                    instrument_id=instrument.id,
                    symbol=symbol,
                    timeframe=timeframe,
                ),
            )
            latest_market_state = refresh_result.state.candle if refresh_result.state else None

        # Query the requested range directly. Both live and bounded chart paths
        # need only the candles they render; the ingestion scheduler owns long
        # history expansion and this request must never launch it.
        candles = candle_repository.get_candles(
            db=db,
            instrument_id=instrument.id,
            timeframe=timeframe,
            limit=limit,
            start_time=start_time,
            end_time=end_time,
        )
        # Bounded historical chart requests normally need only the requested
        # window. Do not compare that window against a 1000-candle threshold:
        # doing so can unnecessarily start foreground ingestion and can fail a
        # historical chart even when the search engine already has the match.
        if not candles and start_time is not None and end_time is not None:
            # A historical match may be outside the currently cached window.
            # Load exactly that window instead of seeding unrelated recent data.
            if instrument.provider == "binance":
                try:
                    candles = _load_exact_binance_window(
                        db=db,
                        instrument_id=instrument.id,
                        symbol=symbol,
                        timeframe=timeframe,
                        start_time=start_time,
                        end_time=end_time,
                    )
                except Exception as history_error:
                    db.rollback()
                    print(
                        f"Historical candle fetch failed for {symbol} {timeframe}: {history_error}",
                        flush=True,
                    )
            elif instrument.provider == "yahoo":
                try:
                    ensure_yahoo_market_data(
                        symbol=symbol,
                        timeframe=timeframe,
                        minimum_candles=min(limit, 1000),
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
                except Exception as history_error:
                    db.rollback()
                    print(
                        f"Historical Yahoo fetch failed for {symbol} {timeframe}: {history_error}",
                        flush=True,
                    )
        elif start_time is None and end_time is None and len(candles) < min(limit, 1000):
            db.expire_all()
            if instrument.provider == "yahoo":
                ensure_yahoo_market_data(
                    symbol=symbol,
                    timeframe=timeframe,
                    minimum_candles=min(limit, 1000),
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
                    minimum_candles=min(limit, 1000),
                    background_history=False,
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

        # The latest candle is shared through Redis, but historical candles remain
        # PostgreSQL-backed. Merge the compact shared state into the response so
        # every concurrent chart sees the same current candle without reading a
        # provider independently.
        if latest_market_state is not None:
            latest_time = int(latest_market_state["time"])
            replaced = False
            for index, candle in enumerate(candles):
                candle_time = int(candle.timestamp.replace(tzinfo=timezone.utc).timestamp())
                if candle_time == latest_time:
                    candles[index] = MarketCandle(
                        timestamp=candle.timestamp,
                        open=latest_market_state["open"],
                        high=latest_market_state["high"],
                        low=latest_market_state["low"],
                        close=latest_market_state["close"],
                        volume=latest_market_state["volume"],
                    )
                    replaced = True
                    break
            if not replaced:
                latest_timestamp = datetime.fromtimestamp(latest_time, tz=timezone.utc).replace(tzinfo=None)
                candles.append(
                    MarketCandle(
                        timestamp=latest_timestamp,
                        open=latest_market_state["open"],
                        high=latest_market_state["high"],
                        low=latest_market_state["low"],
                        close=latest_market_state["close"],
                        volume=latest_market_state["volume"],
                    )
                )
                candles.sort(key=lambda item: item.timestamp)

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

    # Bounded historical requests only need the requested candles. Avoid the
    # separate full-table time-range aggregate here; it is unnecessary for the
    # historical chart and can turn an otherwise valid bounded read into a 500.
    if start_time is not None and end_time is not None:
        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "count": len(candles),
            "available_start_time": None,
            "available_end_time": None,
            "provider": instrument.provider,
            "candles": [
                {
                    "time": int(c.timestamp.replace(tzinfo=timezone.utc).timestamp()),
                    "open": c.open,
                    "high": c.high,
                    "low": c.low,
                    "close": c.close,
                    "volume": c.volume,
                }
                for c in candles
            ],
        }

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
