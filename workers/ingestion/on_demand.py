from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Lock

from sqlalchemy import text

from backend.app.db.session import SessionLocal
from backend.app.repositories.candle import CandleRepository
from backend.app.repositories.instrument import InstrumentRepository
from market_data.providers.binance import BinanceProvider
from market_data.quality.validator import CandleValidator
from market_data.timeframes.utils import TIMEFRAME_MINUTES, floor_to_timeframe, timeframe_delta
from workers.ingestion.historical import HistoricalDownloader

_TARGET_HISTORY_DAYS = 365
_TIMEFRAMES = ("5m", "15m", "1h")
_MAX_BACKGROUND_WORKERS = 3
_FAST_SEED_CANDLES = 1000

_executor = ThreadPoolExecutor(max_workers=_MAX_BACKGROUND_WORKERS, thread_name_prefix="market-warmup")
_lock = Lock()
_running: dict[tuple[str, str], Future[object]] = {}


def _coverage(symbol: str, timeframe: str) -> tuple[datetime | None, datetime | None, int]:
    with SessionLocal() as db:
        row = db.execute(text("""
            SELECT MIN(c.timestamp), MAX(c.timestamp), COUNT(*)
            FROM candles c JOIN instruments i ON i.id = c.instrument_id
            WHERE i.symbol = :symbol AND i.exchange = 'binance' AND i.provider = 'binance' AND c.timeframe = :timeframe
        """), {"symbol": symbol, "timeframe": timeframe}).one()
    return row[0], row[1], int(row[2] or 0)


def _active_job(symbol: str, timeframe: str) -> bool:
    with SessionLocal() as db:
        return db.execute(text("""
            SELECT 1 FROM ingestion_jobs WHERE symbol = :symbol AND timeframe = :timeframe AND status IN ('queued', 'running') LIMIT 1
        """), {"symbol": symbol, "timeframe": timeframe}).first() is not None


def _fast_seed(symbol: str, timeframe: str, minimum_candles: int) -> int:
    min_time, max_time, count = _coverage(symbol, timeframe)
    if count >= minimum_candles:
        return count
    delta = timeframe_delta(timeframe)
    end = floor_to_timeframe(datetime.now(timezone.utc), timeframe)
    start = end - delta * _FAST_SEED_CANDLES
    candles = BinanceProvider().get_candles(symbol=symbol, timeframe=timeframe, start=start, end=end)
    candles = [candle for candle in candles if candle.timestamp + delta <= datetime.now(timezone.utc)]
    if not candles:
        return count
    validation = CandleValidator().validate(candles=candles, timeframe_minutes=TIMEFRAME_MINUTES[timeframe])
    if not validation.valid:
        raise RuntimeError("Fast market seed failed candle validation")
    with SessionLocal() as db:
        instrument = InstrumentRepository().get_or_create(db=db, symbol=symbol, asset_class="crypto", exchange="binance", provider="binance")
        inserted = CandleRepository().insert_many(db=db, instrument_id=instrument.id, timeframe=timeframe, candles=candles)
        db.commit()
    return max(count, inserted)


def refresh_latest_market_candle(symbol: str, timeframe: str) -> bool:
    """Refresh only the current Binance candle; historical chart requests never call this."""
    symbol = symbol.upper()
    timeframe = timeframe.lower()
    if timeframe not in TIMEFRAME_MINUTES:
        raise ValueError(f"Unsupported timeframe: {timeframe}")

    with SessionLocal() as db:
        row = db.execute(text("""
            SELECT id, exchange, provider, is_listed, is_spot_trading_allowed
            FROM instruments WHERE symbol = :symbol LIMIT 1
        """), {"symbol": symbol}).one_or_none()
    if row is None:
        return False
    instrument_id, exchange, provider, is_listed, is_spot = row
    if exchange != "binance" or provider != "binance" or not is_listed or not is_spot:
        return False

    delta = timeframe_delta(timeframe)
    now = datetime.now(timezone.utc)
    end = floor_to_timeframe(now, timeframe) + delta
    start = end - (delta * 2)
    candles = BinanceProvider().get_candles(symbol=symbol, timeframe=timeframe, start=start, end=end)
    current_start = floor_to_timeframe(now, timeframe)
    current = [candle for candle in candles if candle.timestamp == current_start]
    if not current:
        return False
    candle = current[-1]
    validation = CandleValidator().validate(candles=[candle], timeframe_minutes=TIMEFRAME_MINUTES[timeframe])
    if not validation.valid:
        raise RuntimeError("Latest market candle failed validation")

    with SessionLocal() as db:
        CandleRepository().upsert_many(db=db, instrument_id=instrument_id, timeframe=timeframe, candles=[candle])
        db.commit()
    return True


def _run_full_history(symbol: str, timeframe: str) -> None:
    symbol = symbol.upper()
    now = datetime.now(timezone.utc)
    desired_start = floor_to_timeframe(now - timedelta(days=_TARGET_HISTORY_DAYS), timeframe)
    end = floor_to_timeframe(now, timeframe)
    min_time, max_time, _ = _coverage(symbol, timeframe)
    if _active_job(symbol, timeframe):
        return
    start = desired_start if min_time is None or min_time > desired_start else min_time
    if max_time is not None and max_time >= end and min_time is not None and min_time <= desired_start:
        return
    if start >= end:
        return
    HistoricalDownloader().download(symbol=symbol, timeframe=timeframe, start=start, end=end)


def _run_and_release(symbol: str, timeframe: str) -> None:
    try:
        _run_full_history(symbol, timeframe)
    except Exception as exc:
        print(f"On-demand history failed for {symbol} {timeframe}: {exc}", flush=True)
    finally:
        with _lock:
            _running.pop((symbol, timeframe), None)


def _submit_full_history(symbol: str, timeframe: str) -> None:
    """Warm only the timeframe the user requested; never create hidden work for other charts."""
    key = (symbol.upper(), timeframe)
    with _lock:
        existing = _running.get(key)
        if existing is not None and not existing.done():
            return
        _running[key] = _executor.submit(_run_and_release, symbol.upper(), timeframe)


def ensure_market_data(
    symbol: str,
    timeframe: str,
    minimum_candles: int,
    *,
    background_history: bool = True,
) -> dict[str, object]:
    """Ensure the requested data exists without forcing long history work on latency-sensitive callers.

    ``background_history`` is enabled for chart/data requests, while pattern search
    can disable it so a search never launches a year-long downloader just because
    the stored history is still being expanded by the scheduler.
    """
    symbol = symbol.upper()
    timeframe = timeframe.lower()
    with SessionLocal() as db:
        provider = db.execute(text("SELECT provider FROM instruments WHERE symbol = :symbol LIMIT 1"), {"symbol": symbol}).scalar_one_or_none()
    if provider == "yahoo":
        from workers.ingestion.yahoo_on_demand import ensure_yahoo_market_data
        return ensure_yahoo_market_data(symbol=symbol, timeframe=timeframe, minimum_candles=minimum_candles)
    if provider not in (None, "binance"):
        raise ValueError(f"Unsupported market provider: {provider}")
    if timeframe not in TIMEFRAME_MINUTES:
        raise ValueError(f"Unsupported timeframe: {timeframe}")
    min_time, max_time, count = _coverage(symbol, timeframe)
    seeded = False
    if count < minimum_candles:
        before = count
        count = _fast_seed(symbol, timeframe, minimum_candles)
        seeded = count > before
        min_time, max_time, count = _coverage(symbol, timeframe)
    if background_history:
        # The requested timeframe gets background history. Other timeframes are
        # deliberately left alone until requested or promoted by the scheduler.
        _submit_full_history(symbol, timeframe)
    return {"symbol": symbol, "timeframe": timeframe, "candle_count": count, "start_time": min_time.isoformat() if min_time else None, "end_time": max_time.isoformat() if max_time else None, "seeded": seeded, "target_history_days": _TARGET_HISTORY_DAYS}
