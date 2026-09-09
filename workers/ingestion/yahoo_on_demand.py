from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Lock

from sqlalchemy import func, select

from backend.app.db.session import SessionLocal
from backend.app.models.candle import Candle
from backend.app.models.instrument import Instrument
from backend.app.repositories.candle import CandleRepository
from market_data.providers.yahoo import YahooFinanceProvider

_INTRADAY_FULL_DAYS = 60
_DAILY_FULL_DAYS = 3650
_FAST_INTRADAY_DAYS = 7
_FAST_DAILY_DAYS = 365
_TIMEFRAMES = {"1m", "5m", "15m", "30m", "1h", "1d"}
_MAX_WORKERS = 2

_executor = ThreadPoolExecutor(max_workers=_MAX_WORKERS, thread_name_prefix="yahoo-warmup")
_lock = Lock()
_running: dict[tuple[str, str], Future[object]] = {}


def _coverage(symbol: str, timeframe: str) -> tuple[datetime | None, datetime | None, int]:
    with SessionLocal() as db:
        start = db.execute(select(Candle.timestamp).join(Instrument, Instrument.id == Candle.instrument_id).where(Instrument.symbol == symbol, Instrument.provider == "yahoo", Candle.timeframe == timeframe).order_by(Candle.timestamp.asc()).limit(1)).scalar_one_or_none()
        end = db.execute(select(Candle.timestamp).join(Instrument, Instrument.id == Candle.instrument_id).where(Instrument.symbol == symbol, Instrument.provider == "yahoo", Candle.timeframe == timeframe).order_by(Candle.timestamp.desc()).limit(1)).scalar_one_or_none()
        count = int(db.execute(select(func.count(Candle.id)).join(Instrument, Instrument.id == Candle.instrument_id).where(Instrument.symbol == symbol, Instrument.provider == "yahoo", Candle.timeframe == timeframe)).scalar_one() or 0)
    return start, end, count


def _instrument(db, symbol: str) -> Instrument:
    instrument = db.execute(select(Instrument).where(Instrument.symbol == symbol)).scalar_one_or_none()
    if instrument is None:
        raise ValueError(f"Yahoo instrument not registered: {symbol}")
    if instrument.provider != "yahoo":
        raise ValueError(f"Symbol is owned by provider {instrument.provider}: {symbol}")
    return instrument


def _fetch_and_store(symbol: str, timeframe: str, start: datetime, end: datetime) -> int:
    candles = YahooFinanceProvider().get_candles(symbol, timeframe, start, end)
    if not candles:
        return 0
    with SessionLocal() as db:
        instrument = _instrument(db, symbol)
        inserted = CandleRepository().insert_many(db=db, instrument_id=instrument.id, timeframe=timeframe, candles=candles)
        db.commit()
    return inserted


def _run_full(symbol: str, timeframe: str) -> None:
    now = datetime.now(timezone.utc)
    days = _INTRADAY_FULL_DAYS if timeframe != "1d" else _DAILY_FULL_DAYS
    desired_start = now - timedelta(days=days)
    min_time, max_time, _ = _coverage(symbol, timeframe)
    start = desired_start if min_time is None or min_time > desired_start else min_time
    if max_time is not None and min_time is not None and min_time <= desired_start and max_time >= now - timedelta(days=2):
        return
    if start >= now:
        return
    _fetch_and_store(symbol, timeframe, start, now)


def _release(symbol: str, timeframe: str) -> None:
    try:
        _run_full(symbol, timeframe)
    except Exception as exc:
        print(f"Yahoo background history failed for {symbol} {timeframe}: {exc}", flush=True)
    finally:
        with _lock:
            _running.pop((symbol, timeframe), None)


def _submit_background(symbol: str) -> None:
    for timeframe in _TIMEFRAMES:
        key = (symbol, timeframe)
        with _lock:
            current = _running.get(key)
            if current is not None and not current.done():
                continue
            _running[key] = _executor.submit(_release, symbol, timeframe)


def ensure_yahoo_market_data(symbol: str, timeframe: str, minimum_candles: int) -> dict[str, object]:
    symbol = symbol.strip().upper()
    timeframe = timeframe.strip().lower()
    if timeframe not in _TIMEFRAMES:
        raise ValueError(f"Unsupported Yahoo timeframe: {timeframe}")
    min_time, max_time, count = _coverage(symbol, timeframe)
    if count < minimum_candles:
        now = datetime.now(timezone.utc)
        days = _FAST_INTRADAY_DAYS if timeframe != "1d" else _FAST_DAILY_DAYS
        _fetch_and_store(symbol, timeframe, now - timedelta(days=days), now)
        min_time, max_time, count = _coverage(symbol, timeframe)
    _submit_background(symbol)
    return {"symbol": symbol, "timeframe": timeframe, "candle_count": count, "start_time": min_time.isoformat() if min_time else None, "end_time": max_time.isoformat() if max_time else None, "provider": "yahoo", "intraday_history_limit_days": _INTRADAY_FULL_DAYS}
