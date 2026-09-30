from __future__ import annotations

import argparse
import os
import statistics
import time
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import select

from backend.app.core.config import get_settings
from backend.app.db.session import SessionLocal
from backend.app.models.instrument import Instrument
from backend.app.search.service import (
    PatternSearchService,
    _CACHE_LOCK,
    _NUMERICAL_CACHE,
    _RESULT_CACHE,
)
from backend.app.services.numerical_cache import prepared_numerical_cache


def clear_local_caches(clear_prepared: bool = True) -> None:
    with _CACHE_LOCK:
        _NUMERICAL_CACHE.clear()
        _RESULT_CACHE.clear()
    if clear_prepared:
        prepared_numerical_cache.clear()


def instrument_id_for(symbol: str) -> int:
    with SessionLocal() as db:
        instrument = db.execute(
            select(Instrument.id).where(Instrument.symbol == symbol)
        ).scalar_one_or_none()
    if instrument is None:
        raise SystemExit(f"Instrument not found: {symbol}")
    return int(instrument)


def timed_search(service, instrument_id: int, symbol: str, timeframe: str, pattern_length: int, top_k: int) -> float:
    started = time.perf_counter()
    service.search(
        instrument_id=instrument_id,
        symbol=symbol,
        timeframe=timeframe,
        pattern_length=pattern_length,
        top_k=top_k,
    )
    return time.perf_counter() - started


def run_mode(enabled: bool, instrument_id: int, symbol: str, timeframe: str, pattern_length: int, top_k: int) -> None:
    os.environ["CALC_CACHE_ENABLED"] = "true" if enabled else "false"
    os.environ["PATTERN_SEARCH_PROFILE"] = "false"
    get_settings.cache_clear()
    clear_local_caches(clear_prepared=True)

    service = PatternSearchService()
    cold = timed_search(service, instrument_id, symbol, timeframe, pattern_length, top_k)

    # Keep the prepared store but clear the final response cache so this measures
    # reusable preparation rather than final-result memoization.
    with _CACHE_LOCK:
        _RESULT_CACHE.clear()
    warm = timed_search(service, instrument_id, symbol, timeframe, pattern_length, top_k)

    clear_local_caches(clear_prepared=True)
    barrier = __import__("threading").Barrier(20)

    def concurrent_call(index: int) -> float:
        barrier.wait()
        return timed_search(service, instrument_id, symbol, timeframe, pattern_length, 10 + index)

    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=20) as executor:
        latencies = list(executor.map(concurrent_call, range(20)))
    concurrent_elapsed = time.perf_counter() - started

    print(
        f"mode={'enabled' if enabled else 'disabled'} "
        f"cold={cold:.4f}s warm={warm:.4f}s "
        f"concurrent_wall={concurrent_elapsed:.4f}s "
        f"concurrent_p50={statistics.median(latencies):.4f}s "
        f"concurrent_max={max(latencies):.4f}s "
        f"cache={prepared_numerical_cache.stats()}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Phase 2 numerical preparation benchmark")
    parser.add_argument("--symbol", default="ETHUSDT")
    parser.add_argument("--timeframe", default="5m")
    parser.add_argument("--pattern-length", type=int, default=45)
    parser.add_argument("--top-k", type=int, default=10)
    args = parser.parse_args()

    instrument_id = instrument_id_for(args.symbol.upper())
    run_mode(False, instrument_id, args.symbol.upper(), args.timeframe.lower(), args.pattern_length, args.top_k)
    run_mode(True, instrument_id, args.symbol.upper(), args.timeframe.lower(), args.pattern_length, args.top_k)


if __name__ == "__main__":
    main()
