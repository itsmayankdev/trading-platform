from __future__ import annotations

import os
import time
from collections import OrderedDict
from statistics import median
from threading import Lock

from sqlalchemy import desc, select

from backend.app.db.session import SessionLocal
from backend.app.models.candle import Candle
from workers.ingestion.on_demand import ensure_market_data

from pattern_engine.retrieval.numerical import NumericalWindowStore
from pattern_engine.window import CandlePoint, PatternWindow
from pattern_engine.ranking import PatternRanker
from pattern_engine.outcomes import calculate_outcomes
from pattern_engine.statistics import calculate_statistics
from pattern_engine.diagnostics import build_match_diagnostics

_CACHE_MAX_ENTRIES = 16
_CACHE_TTL_SECONDS = 30.0
_RESULT_CACHE_MAX_ENTRIES = 12
_RESULT_CACHE_TTL_SECONDS = 10.0
# V1 remains the fast candidate generator. Production V3 then re-ranks a broad
# candidate pool using complete OHLCV structure. This two-stage design avoids a
# full structural scan of years of minute data while preventing close-path-only
# similarity from deciding the final matches.
_CANDIDATE_POOL_MIN = 200
_CANDIDATE_POOL_MULTIPLIER = 20
_CANDIDATE_POOL_MAX = 500
_NUMERICAL_CACHE: OrderedDict[tuple[int, str], tuple[float, object, object, tuple]] = OrderedDict()
_RESULT_CACHE: OrderedDict[tuple[int, str, int, int], tuple[float, object, object, dict]] = OrderedDict()
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
                if (
                    now - cached_at <= _CACHE_TTL_SECONDS
                    and cached_timestamp == latest_timestamp
                    and cached_close == latest_close
                ):
                    _NUMERICAL_CACHE.move_to_end(key)
                    return cached_rows, True

        rows = tuple(
            db.execute(
                select(
                    Candle.timestamp,
                    Candle.open,
                    Candle.high,
                    Candle.low,
                    Candle.close,
                    Candle.volume,
                )
                .where(Candle.instrument_id == instrument_id, Candle.timeframe == timeframe)
                .order_by(Candle.timestamp.asc())
            ).all()
        )

        with _CACHE_LOCK:
            _NUMERICAL_CACHE[key] = (now, latest_timestamp, latest_close, rows)
            _NUMERICAL_CACHE.move_to_end(key)
            while len(_NUMERICAL_CACHE) > _CACHE_MAX_ENTRIES:
                _NUMERICAL_CACHE.popitem(last=False)
        return rows, False


def _get_cached_result(key: tuple[int, str, int, int], latest_timestamp, latest_close):
    now = time.monotonic()
    with _CACHE_LOCK:
        cached = _RESULT_CACHE.get(key)
        if cached is None:
            return None
        cached_at, cached_timestamp, cached_close, response = cached
        if (
            now - cached_at > _RESULT_CACHE_TTL_SECONDS
            or cached_timestamp != latest_timestamp
            or cached_close != latest_close
        ):
            _RESULT_CACHE.pop(key, None)
            return None
        _RESULT_CACHE.move_to_end(key)
        return response


def _put_cached_result(key: tuple[int, str, int, int], latest_timestamp, latest_close, response: dict) -> None:
    with _CACHE_LOCK:
        _RESULT_CACHE[key] = (time.monotonic(), latest_timestamp, latest_close, response)
        _RESULT_CACHE.move_to_end(key)
        while len(_RESULT_CACHE) > _RESULT_CACHE_MAX_ENTRIES:
            _RESULT_CACHE.popitem(last=False)


def _window_from_rows(symbol: str, timeframe: str, rows, start_index: int, length: int) -> PatternWindow:
    selected = rows[start_index : start_index + length]
    if len(selected) != length:
        raise ValueError("Insufficient candles for historical pattern window")
    return PatternWindow(
        symbol=symbol,
        timeframe=timeframe,
        start_time=selected[0].timestamp,
        end_time=selected[-1].timestamp,
        candles=tuple(
            CandlePoint(
                timestamp=row.timestamp,
                open=row.open,
                high=row.high,
                low=row.low,
                close=row.close,
                volume=row.volume,
            )
            for row in selected
        ),
    )


class PatternSearchService:
    def search(self, instrument_id: int, symbol: str, timeframe: str, pattern_length: int = 45, top_k: int = 10):
        profile = os.getenv("PATTERN_SEARCH_PROFILE", "false").lower() == "true"
        timings: dict[str, float] = {}

        def mark(name: str, started: float) -> None:
            if profile:
                timings[name] = time.perf_counter() - started

        started = time.perf_counter()
        ensure_market_data(symbol, timeframe, pattern_length + 1)
        mark("warmup_check", started)

        started = time.perf_counter()
        rows, cache_hit = _cached_numerical_rows(instrument_id, timeframe)
        mark("numerical_db_load", started)
        if len(rows) < pattern_length + 1:
            raise ValueError("Market data is still warming up; please retry in a moment")

        latest_timestamp, latest_close = rows[-1].timestamp, rows[-1].close
        result_key = (instrument_id, timeframe, pattern_length, top_k)
        cached_result = _get_cached_result(result_key, latest_timestamp, latest_close)
        if cached_result is not None:
            return cached_result

        timestamps = [row.timestamp for row in rows]
        closes = [row.close for row in rows]
        timestamp_to_index = {timestamp: index for index, timestamp in enumerate(timestamps)}

        started = time.perf_counter()
        current_candles = [
            CandlePoint(
                timestamp=row.timestamp,
                open=row.open,
                high=row.high,
                low=row.low,
                close=row.close,
                volume=row.volume,
            )
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
        store = NumericalWindowStore.from_columns(
            timestamps=timestamps,
            closes=closes,
            window_length=pattern_length,
        )
        mark("numerical_store", started)

        started = time.perf_counter()
        production_ranker = PatternRanker()
        retrieval_ranker = PatternRanker("similarity_v1")
        candidate_pool = min(
            _CANDIDATE_POOL_MAX,
            max(_CANDIDATE_POOL_MIN, top_k * _CANDIDATE_POOL_MULTIPLIER),
        )
        candidates = retrieval_ranker.rank_numerical_v1(
            current=current,
            store=store,
            top_k=candidate_pool,
            min_separation_candles=pattern_length,
        )

        # Rebuild only the broad candidate pool with full OHLCV data, then let
        # production V3 perform the final structural ranking and separation.
        candidate_windows = []
        candidate_matches = []
        for candidate in candidates:
            start_index = timestamp_to_index.get(candidate.start_time)
            if start_index is None:
                continue
            try:
                candidate_windows.append(
                    _window_from_rows(symbol, timeframe, rows, start_index, pattern_length)
                )
                candidate_matches.append(candidate)
            except ValueError:
                continue

        matches = production_ranker.rank(
            current=current,
            historical_windows=candidate_windows,
            top_k=top_k,
            min_separation_candles=pattern_length,
        )
        mark("candidate_retrieval_and_structural_ranking", started)

        # Index final ranked windows by their start time for exact result lookup.
        match_windows = {window.start_time: window for window in candidate_windows}

        started = time.perf_counter()
        match_results = []
        forward_paths = []
        all_outcomes = []
        max_horizon = 60

        # Reuse the already-loaded OHLCV rows for every winning window. This
        # eliminates the previous N+1 database-query pattern without changing
        # outcome calculations or their high/low inputs.
        for match_index, match in enumerate(matches, start=1):
            start_index = timestamp_to_index[match.start_time]
            future_end_index = min(start_index + pattern_length + max_horizon - 1, len(rows) - 1)
            matched_rows = rows[start_index : start_index + pattern_length]
            future_rows = rows[start_index + pattern_length : future_end_index + 1]
            matched_window = match_windows.get(match.start_time)
            if matched_window is None:
                matched_window = _window_from_rows(symbol, timeframe, rows, start_index, pattern_length)

            future = [
                CandlePoint(
                    timestamp=row.timestamp,
                    open=row.open,
                    high=row.high,
                    low=row.low,
                    close=row.close,
                    volume=row.volume,
                )
                for row in future_rows
            ]
            outcomes = calculate_outcomes(match=matched_window, future_candles=future)
            all_outcomes.extend(outcomes)

            entry_close = matched_window.candles[-1].close
            path_values = [0.0]
            path_values.extend(
                (row.close / entry_close - 1.0) if entry_close else 0.0
                for row in future_rows
            )
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
            "algorithm_version": production_ranker.algorithm.version,
            "feature_version": production_ranker.algorithm.feature_version,
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
        _put_cached_result(result_key, latest_timestamp, latest_close, response)

        if profile:
            total = sum(timings.values())
            print(
                "PATTERN_SEARCH_PROFILE "
                + " ".join(f"{name}={value:.4f}s" for name, value in timings.items())
                + f" cache_hit={cache_hit} candidates={len(candidates)} candles={len(rows)} stages={total:.4f}s"
            )
        return response
