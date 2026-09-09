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


# Only user-selected markets enter this fast lane. Binance discovery remains
# lightweight; we never pre-download a year for the entire exchange universe.
_TARGET_HISTORY_DAYS = 365
_TIMEFRAMES = ("5m", "15m", "1h")
_MAX_BACKGROUND_WORKERS = 3
_FAST_SEED_CANDLES = 1000

_executor = ThreadPoolExecutor(max_workers=_MAX_BACKGROUND_WORKERS, thread_name_prefix="market-warmup")
_lock = Lock()
_running: dict[tuple[str, str], Future[object]] = {}


def _coverage(symbol: str, timeframe: str) -> tuple[datetime | None, datetime | None, int]:
    with SessionLocal() as db:
        row = db.execute(
            text(
                """
                SELECT MIN(c.timestamp), MAX(c.timestamp), COUNT(*)
                FROM candles c
                JOIN instruments i ON i.id = c.instrument_id
                WHERE i.symbol = :symbol
                  AND i.exchange = 'binance'
                  AND i.provider = 'binance'
                  AND c.timeframe = :timeframe
                """
            ),
            {"symbol": symbol, "timeframe": timeframe},
        ).one()
    return row[0], row[1], int(row[2] or 0)


def _active_job(symbol: str, timeframe: str) -> bool:
    with SessionLocal() as db:
        return db.execute(
            text(
                """
                SELECT 1 FROM ingestion_jobs
                WHERE symbol = :symbol
                  AND timeframe = :timeframe
                  AND status IN ('queued', 'running')
                LIMIT 1
                """
            ),
            {"symbol": symbol, "timeframe": timeframe},
        ).first() is not None


def _fast_seed(symbol: str, timeframe: str, minimum_candles: int) -> int:
    """Fetch one Binance page directly so a new market becomes usable fast.

    This deliberately bypasses the persisted historical-job path. A first-page
    seed is small enough for the request path; the one-year workload stays in the
    background. This also makes first-use independent of a worker process.
    """
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
        instrument = InstrumentRepository().get_or_create(
            db=db,
            symbol=symbol,
            asset_class="crypto",
            exchange="binance",
            provider="binance",
        )
        inserted = CandleRepository().insert_many(
            db=db,
            instrument_id=instrument.id,
            timeframe=timeframe,
            candles=candles,
        )
        db.commit()
    return max(count, inserted)


def _run_full_history(symbol: str, timeframe: str) -> None:
    symbol = symbol.upper()
    now = datetime.now(timezone.utc)
    desired_start = floor_to_timeframe(now - timedelta(days=_TARGET_HISTORY_DAYS), timeframe)
    end = floor_to_timeframe(now, timeframe)
    min_time, max_time, _ = _coverage(symbol, timeframe)

    if _active_job(symbol, timeframe):
        return

    # Extend only the missing left edge. If the right edge is stale, the normal
    # scheduler/incremental ingestion owns that responsibility.
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


def _submit_full_history(symbol: str) -> None:
    symbol = symbol.upper()
    for timeframe in _TIMEFRAMES:
        key = (symbol, timeframe)
        with _lock:
            existing = _running.get(key)
            if existing is not None and not existing.done():
                continue
            _running[key] = _executor.submit(_run_and_release, symbol, timeframe)


def ensure_market_data(symbol: str, timeframe: str, minimum_candles: int) -> dict[str, object]:
    """Make a selected market usable immediately and warm it to one year.

    First use performs at most one small Binance page for the requested
    timeframe. The complete 365-day 5m/15m/1h history is then fetched in
    independent background workers and only for this selected market.
    """
    symbol = symbol.upper()
    timeframe = timeframe.lower()
    if timeframe not in TIMEFRAME_MINUTES:
        raise ValueError(f"Unsupported timeframe: {timeframe}")

    min_time, max_time, count = _coverage(symbol, timeframe)
    seeded = False

    if count < minimum_candles:
        before = count
        count = _fast_seed(symbol, timeframe, minimum_candles)
        seeded = count > before
        min_time, max_time, count = _coverage(symbol, timeframe)

    _submit_full_history(symbol)

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "candle_count": count,
        "start_time": min_time.isoformat() if min_time else None,
        "end_time": max_time.isoformat() if max_time else None,
        "seeded": seeded,
        "target_history_days": _TARGET_HISTORY_DAYS,
    }
