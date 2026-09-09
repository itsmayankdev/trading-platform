from __future__ import annotations

import os
import time
from collections import OrderedDict
from threading import Lock
from statistics import median

from sqlalchemy import and_, desc, select

from backend.app.db.session import SessionLocal
from backend.app.models.candle import Candle
from workers.ingestion.on_demand import ensure_market_data

from pattern_engine.retrieval.numerical import NumericalWindowStore
from pattern_engine.window import CandlePoint, PatternWindow
from pattern_engine.ranking import PatternRanker
from pattern_engine.outcomes import calculate_outcomes
from pattern_engine.statistics import calculate_statistics
from pattern_engine.diagnostics import build_match_diagnostics


# The hot path keeps only timestamp/close columns in memory. OHLCV is fetched
# only for the small set of winning historical windows. This avoids moving a
# full year's worth of Python ORM rows through the search request.
_CACHE_MAX_ENTRIES = 16
_CACHE_TTL_SECONDS = 30.0
_NUMERICAL_CACHE: OrderedDict[tuple[int, str], tuple[float, object, object, tuple]] = OrderedDict()
_CACHE_LOCK = Lock()


def _cached_numerical_rows(instrument_id: int, timeframe: str) -> tuple[tuple, bool]:
    key = (instrument_id, timeframe)
    now = time.monotonic()

    with SessionLocal() as db:
        latest = db.execute(
            select(Candle.timestamp, Candle.close)
            .where(Candle.instrument_id == instrument_id, Candle.timeframe == timeframe)
            .order_by(desc(Candle.timestamp))
            .limit(1)
        ).first()
        if latest is None:
            return (), False

        latest_timestamp, latest_close = latest
        with _CACHE_LOCK:
            cached = _NUMERICAL_CACHE.get(key)
            if cached is not None:
                cached_at, cached_timestamp, cached_close, cached_rows = cached
                if now - cached_at <= _CACHE_TTL_SECONDS and cached_timestamp == latest_timestamp and cached_close == latest_close:
                    _NUMERICAL_CACHE.move_to_end(key)
                    return cached_rows, True

            rows = tuple(
                db.execute(
                    select(Candle.timestamp, Candle.close)
                    .where(Candle.instrument_id == instrument_id, Candle.timeframe == timeframe)
                    .order_by(Candle.timestamp.asc())
                ).all()
            )
            _NUMERICAL_CACHE[key] = (now, latest_timestamp, latest_close, rows)
            _NUMERICAL_CACHE.move_to_end(key)
            while len(_NUMERICAL_CACHE) > _CACHE_MAX_ENTRIES:
                _NUMERICAL_CACHE.popitem(last=False)
            return rows, False


def _load_window_rows(instrument_id: int, timeframe: str, start_time, end_time) -> tuple:
    """Load OHLCV only for one matched window and its forward horizon."""
    with SessionLocal() as db:
        return tuple(
            db.execute(
                select(Candle.timestamp, Candle.open, Candle.high, Candle.low, Candle.close, Candle.volume)
                .where(
                    Candle.instrument_id == instrument_id,
                    Candle.timeframe == timeframe,
                    and_(Candle.timestamp >= start_time, Candle.timestamp <= end_time),
                )
                .order_by(Candle.timestamp.asc())
            ).all()
        )


class PatternSearchService:
    def search(self, instrument_id: int, symbol: str, timeframe: str, pattern_length: int = 45, top_k: int = 10):
        profile = os.getenv("PATTERN_SEARCH_PROFILE", "false").lower() == "true"
        timings: dict[str, float] = {}

        def mark(name: str, started: float) -> None:
            if profile:
                timings[name] = time.perf_counter() - started

        # On a warmed market this is a cheap coverage check. On a new market it
        # seeds only enough recent candles for the requested search and queues the
        # complete one-year 5m/15m/1h history asynchronously.
        started = time.perf_counter()
        ensure_market_data(symbol, timeframe, pattern_length + 1)
        mark("warmup_check", started)

        started = time.perf_counter()
        rows, cache_hit = _cached_numerical_rows(instrument_id, timeframe)
        mark("numerical_db_load", started)
        if len(rows) < pattern_length + 1:
            raise ValueError("Market data is still warming up; please retry in a moment")

        timestamps = [row.timestamp for row in rows]
        closes = [row.close for row in rows]
        timestamp_to_index = {timestamp: index for index, timestamp in enumerate(timestamps)}

        started = time.perf_counter()
        current_candles = [
            CandlePoint(timestamp=row.timestamp, open=0.0, high=0.0, low=0.0, close=row.close, volume=0.0)
            for row in rows[-pattern_length:]
        ]
        current = PatternWindow(
            symbol=symbol,
            timeframe=timeframe,
            start_time=current_candles[0].timestamp,
            end_time=current_candles[-1].timestamp,
            candles=tuple(current_candles),
        )
        mark("current_pattern", started)

        started = time.perf_counter()
        store = NumericalWindowStore.from_columns(timestamps=timestamps, closes=closes, window_length=pattern_length)
        mark("numerical_store", started)

        started = time.perf_counter()
        ranker = PatternRanker()
        matches = ranker.rank_numerical_v1(
            current=current,
            store=store,
            top_k=top_k,
            min_separation_candles=pattern_length,
        )
        mark("ranking", started)

        started = time.perf_counter()
        match_results = []
        forward_paths = []
        all_outcomes = []
        max_horizon = 60

        for match_index, match in enumerate(matches, start=1):
            start_index = timestamp_to_index[match.start_time]
            future_end_index = min(start_index + pattern_length + max_horizon - 1, len(rows) - 1)
            window_rows = _load_window_rows(
                instrument_id,
                timeframe,
                timestamps[start_index],
                timestamps[future_end_index],
            )
            matched_rows = window_rows[:pattern_length]
            future_rows = window_rows[pattern_length : pattern_length + max_horizon]

            matched_window = PatternWindow(
                symbol=symbol,
                timeframe=timeframe,
                start_time=match.start_time,
                end_time=match.end_time,
                candles=tuple(
                    CandlePoint(
                        timestamp=row.timestamp,
                        open=row.open,
                        high=row.high,
                        low=row.low,
                        close=row.close,
                        volume=row.volume,
                    )
                    for row in matched_rows
                ),
            )
            future = [
                CandlePoint(timestamp=row.timestamp, open=row.open, high=row.high, low=row.low, close=row.close, volume=row.volume)
                for row in future_rows
            ]
            outcomes = calculate_outcomes(match=matched_window, future_candles=future)
            all_outcomes.extend(outcomes)

            entry_close = matched_window.candles[-1].close
            path_values = [0.0]
            path_values.extend((row.close / entry_close - 1.0) if entry_close else 0.0 for row in future_rows)
            forward_paths.append({
                "match_index": match_index,
                "similarity_score": round(match.similarity_score * 100, 4),
                "values": path_values,
            })

            match_results.append({
                "start_time": match.start_time,
                "end_time": match.end_time,
                "similarity_score": round(match.similarity_score * 100, 4),
                "outcomes": [
                    {
                        "horizon_candles": outcome.horizon_candles,
                        "forward_return": outcome.forward_return,
                        "mfe": outcome.mfe,
                        "mae": outcome.mae,
                    }
                    for outcome in outcomes
                ],
            })
        mark("match_details", started)

        started = time.perf_counter()
        statistics = calculate_statistics(all_outcomes)
        match_starts = [match.start_time for match in matches]
        match_scores = [match.similarity_score for match in matches]
        intervals = [
            (timestamps[index + 1] - timestamps[index]).total_seconds()
            for index in range(min(len(timestamps) - 1, 1000))
            if (timestamps[index + 1] - timestamps[index]).total_seconds() > 0
        ]
        candle_interval_seconds = median(intervals) if intervals else 60.0
        diagnostics = build_match_diagnostics(
            starts=match_starts,
            scores=match_scores,
            pattern_length=pattern_length,
            candle_interval_seconds=candle_interval_seconds,
        )
        response = {
            "symbol": symbol,
            "timeframe": timeframe,
            "pattern_length": pattern_length,
            "algorithm_version": ranker.algorithm.version,
            "feature_version": ranker.algorithm.feature_version,
            "current_pattern": {"start_time": current.start_time, "end_time": current.end_time},
            "matches": match_results,
            "statistics": [
                {
                    "horizon_candles": stat.horizon_candles,
                    "sample_size": stat.sample_size,
                    "mean_return": stat.mean_return,
                    "median_return": stat.median_return,
                    "win_rate": stat.win_rate,
                    "mean_mfe": stat.mean_mfe,
                    "mean_mae": stat.mean_mae,
                }
                for stat in statistics
            ],
            "forward_paths": forward_paths,
            "quality_diagnostics": diagnostics,
        }
        mark("response_build", started)

        if profile:
            total = sum(timings.values())
            print(
                "PATTERN_SEARCH_PROFILE "
                + " ".join(f"{name}={value:.4f}s" for name, value in timings.items())
                + f" cache_hit={cache_hit} stages={total:.4f}s candles={len(rows)}"
            )
        return response
