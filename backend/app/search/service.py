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
from pattern_engine.shape_validation import calibrated_similarity, directional_agreement, path_shape_similarity, passes_shape_validation

_CACHE_MAX_ENTRIES = 16
_CACHE_TTL_SECONDS = 30.0
_RESULT_CACHE_MAX_ENTRIES = 12
_RESULT_CACHE_TTL_SECONDS = 10.0
_NUMERICAL_CACHE: OrderedDict[tuple[int, str], tuple[float, object, object, tuple]] = OrderedDict()
_RESULT_CACHE: OrderedDict[tuple[int, str, int, int], tuple[float, object, object, dict]] = OrderedDict()
_CACHE_LOCK = Lock()


def _cached_numerical_rows(instrument_id: int, timeframe: str) -> tuple[tuple, bool]:
    key = (instrument_id, timeframe)
    now = time.monotonic()

    with _CACHE_LOCK:
        cached = _NUMERICAL_CACHE.get(key)
        if cached is not None:
            cached_at, cached_timestamp, cached_close, cached_rows = cached
            if now - cached_at <= _CACHE_TTL_SECONDS:
                _NUMERICAL_CACHE.move_to_end(key)
                return cached_rows, True

    with SessionLocal() as db:
        latest = db.execute(
            select(Candle.timestamp, Candle.close)
            .where(Candle.instrument_id == instrument_id, Candle.timeframe == timeframe)
            .order_by(desc(Candle.timestamp)).limit(1)
        ).first()
        if latest is None:
            return (), False
        latest_timestamp, latest_close = latest

        with _CACHE_LOCK:
            cached = _NUMERICAL_CACHE.get(key)
            if cached is not None:
                cached_at, cached_timestamp, cached_close, cached_rows = cached
                if now - cached_at <= _CACHE_TTL_SECONDS:
                    _NUMERICAL_CACHE.move_to_end(key)
                    return cached_rows, True

        rows = tuple(db.execute(
            select(Candle.timestamp, Candle.open, Candle.high, Candle.low, Candle.close, Candle.volume)
            .where(Candle.instrument_id == instrument_id, Candle.timeframe == timeframe)
            .order_by(Candle.timestamp.asc())
        ).all())
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
        if now - cached_at > _RESULT_CACHE_TTL_SECONDS or cached_timestamp != latest_timestamp or cached_close != latest_close:
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
    selected = rows[start_index:start_index + length]
    if len(selected) != length:
        raise ValueError("Insufficient candles for historical pattern window")
    return PatternWindow(
        symbol=symbol,
        timeframe=timeframe,
        start_time=selected[0].timestamp,
        end_time=selected[-1].timestamp,
        candles=tuple(CandlePoint(timestamp=r.timestamp, open=r.open, high=r.high, low=r.low, close=r.close, volume=r.volume) for r in selected),
    )


class PatternSearchService:
    def search(self, instrument_id: int, symbol: str, timeframe: str, pattern_length: int = 45, top_k: int = 10):
        profile = os.getenv("PATTERN_SEARCH_PROFILE", "false").lower() == "true"
        timings: dict[str, float] = {}

        def mark(name: str, started: float) -> None:
            if profile:
                timings[name] = time.perf_counter() - started

        started = time.perf_counter()
        ensure_market_data(symbol, timeframe, pattern_length + 1, background_history=False)
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
        current = _window_from_rows(symbol, timeframe, rows, len(rows) - pattern_length, pattern_length)
        mark("current_pattern", started)

        started = time.perf_counter()
        store = NumericalWindowStore.from_columns(timestamps=timestamps, closes=closes, window_length=pattern_length)
        mark("numerical_store", started)

        started = time.perf_counter()
        ranker = PatternRanker()
        candidate_count = min(max(top_k * 3, top_k), 50)
        candidates = ranker.rank_numerical_v1(
            current=current,
            store=store,
            top_k=candidate_count,
            min_separation_candles=pattern_length,
        )

        current_closes = [row.close for row in rows[-pattern_length:]]
        validated = []
        for match in candidates:
            start_index = timestamp_to_index.get(match.start_time)
            if start_index is None:
                continue
            historical_closes = [row.close for row in rows[start_index:start_index + pattern_length]]
            agreement = directional_agreement(current_closes, historical_closes)
            shape_score = path_shape_similarity(current_closes, historical_closes)
            if not passes_shape_validation(agreement, shape_score):
                continue
            calibrated = calibrated_similarity(match.similarity_score, agreement, shape_score)
            validated.append((match, agreement, shape_score, calibrated))

        validated.sort(key=lambda item: item[3], reverse=True)
        matches = []
        separation = pattern_length
        for match, agreement, shape_score, calibrated in validated:
            if any(abs(match.start_time - selected.start_time) < (timestamps[1] - timestamps[0]) * separation for selected in matches) if len(timestamps) >= 2 else False:
                continue
            matches.append(type(match)(start_time=match.start_time, end_time=match.end_time, similarity_score=calibrated))
            if len(matches) >= top_k:
                break
        mark("ranking", started)

        started = time.perf_counter()
        match_results = []
        forward_paths = []
        all_outcomes = []
        max_horizon = 60
        for match_index, match in enumerate(matches, start=1):
            start_index = timestamp_to_index[match.start_time]
            future_end_index = min(start_index + pattern_length + max_horizon - 1, len(rows) - 1)
            future_rows = rows[start_index + pattern_length:future_end_index + 1]
            matched_window = _window_from_rows(symbol, timeframe, rows, start_index, pattern_length)
            future = [CandlePoint(timestamp=r.timestamp, open=r.open, high=r.high, low=r.low, close=r.close, volume=r.volume) for r in future_rows]
            outcomes = calculate_outcomes(match=matched_window, future_candles=future)
            all_outcomes.extend(outcomes)

            entry_close = matched_window.candles[-1].close
            path_values = [0.0]
            path_values.extend((r.close / entry_close - 1.0) if entry_close else 0.0 for r in future_rows)
            forward_paths.append({"match_index": match_index, "similarity_score": round(match.similarity_score * 100, 4), "values": path_values})
            match_results.append({
                "start_time": match.start_time,
                "end_time": match.end_time,
                "similarity_score": round(match.similarity_score * 100, 4),
                "outcomes": [{"horizon_candles": o.horizon_candles, "forward_return": o.forward_return, "mfe": o.mfe, "mae": o.mae} for o in outcomes],
            })
        mark("match_details", started)

        started = time.perf_counter()
        statistics = calculate_statistics(all_outcomes)
        match_starts = [match.start_time for match in matches]
        match_scores = [match.similarity_score for match in matches]
        intervals = [(timestamps[i + 1] - timestamps[i]).total_seconds() for i in range(min(len(timestamps) - 1, 1000)) if (timestamps[i + 1] - timestamps[i]).total_seconds() > 0]
        diagnostics = build_match_diagnostics(starts=match_starts, scores=match_scores, pattern_length=pattern_length, candle_interval_seconds=median(intervals) if intervals else 60.0)
        response = {
            "symbol": symbol,
            "timeframe": timeframe,
            "pattern_length": pattern_length,
            "algorithm_version": ranker.algorithm.version,
            "feature_version": ranker.algorithm.feature_version,
            "current_pattern": {"start_time": current.start_time, "end_time": current.end_time},
            "matches": match_results,
            "statistics": [{"horizon_candles": s.horizon_candles, "sample_size": s.sample_size, "mean_return": s.mean_return, "median_return": s.median_return, "win_rate": s.win_rate, "mean_mfe": s.mean_mfe, "mean_mae": s.mean_mae} for s in statistics],
            "forward_paths": forward_paths,
            "quality_diagnostics": diagnostics,
        }
        mark("response_build", started)
        _put_cached_result(result_key, latest_timestamp, latest_close, response)
        if profile:
            total = sum(timings.values())
            print("PATTERN_SEARCH_PROFILE " + " ".join(f"{name}={value:.4f}s" for name, value in timings.items()) + f" cache_hit={cache_hit} candles={len(rows)} stages={total:.4f}s", flush=True)
        return response
