from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Lock

from sqlalchemy import text

from backend.app.db.session import SessionLocal
from market_data.timeframes.utils import TIMEFRAME_MINUTES, floor_to_timeframe
from workers.ingestion.historical import HistoricalDownloader


# Only user-selected markets enter this fast lane. Binance discovery remains
# lightweight; we never pre-download a year for the entire exchange universe.
_FAST_SEED_DAYS = 7
_TARGET_HISTORY_DAYS = 365
_TIMEFRAMES = ("5m", "15m", "1h")
_MAX_BACKGROUND_WORKERS = 3

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


def _run_full_history(symbol: str, timeframe: str) -> None:
    symbol = symbol.upper()
    now = datetime.now(timezone.utc)
    desired_start = floor_to_timeframe(now - timedelta(days=_TARGET_HISTORY_DAYS), timeframe)
    end = floor_to_timeframe(now, timeframe)
    min_time, max_time, _ = _coverage(symbol, timeframe)

    if _active_job(symbol, timeframe):
        return

    # Extend only the missing left edge or right edge. Once a market reaches one
    # year of history, future runs become tiny incremental updates.
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
    """Fast-path a selected market and asynchronously complete one year.

    The selected timeframe receives a small recent seed only when it cannot
    satisfy the requested pattern. Full 365-day history for 5m/15m/1h is then
    fetched independently in the background.
    """
    symbol = symbol.upper()
    timeframe = timeframe.lower()
    if timeframe not in TIMEFRAME_MINUTES:
        raise ValueError(f"Unsupported timeframe: {timeframe}")

    min_time, max_time, count = _coverage(symbol, timeframe)
    seeded = False

    if count < minimum_candles:
        now = datetime.now(timezone.utc)
        seed_end = floor_to_timeframe(now, timeframe)
        seed_start = floor_to_timeframe(now - timedelta(days=_FAST_SEED_DAYS), timeframe)
        if not _active_job(symbol, timeframe):
            HistoricalDownloader().download(
                symbol=symbol,
                timeframe=timeframe,
                start=seed_start,
                end=seed_end,
            )
            seeded = True
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
