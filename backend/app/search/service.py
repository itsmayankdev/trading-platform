import os
import time

from sqlalchemy import select

from backend.app.db.session import SessionLocal
from backend.app.models.candle import Candle

from pattern_engine.retrieval.numerical import build_numerical_store
from pattern_engine.window import CandlePoint, PatternWindow
from pattern_engine.ranking import PatternRanker
from pattern_engine.outcomes import calculate_outcomes
from pattern_engine.statistics import calculate_statistics


class PatternSearchService:

    def search(
        self,
        instrument_id: int,
        symbol: str,
        timeframe: str,
        pattern_length: int = 45,
        top_k: int = 10,
    ):
        profile = os.getenv("PATTERN_SEARCH_PROFILE", "false").lower() == "true"
        timings: dict[str, float] = {}

        def mark(name: str, started: float) -> None:
            if profile:
                timings[name] = time.perf_counter() - started

        started = time.perf_counter()
        with SessionLocal() as db:
            rows = db.execute(
                select(
                    Candle.timestamp,
                    Candle.open,
                    Candle.high,
                    Candle.low,
                    Candle.close,
                    Candle.volume,
                )
                .where(
                    Candle.instrument_id == instrument_id,
                    Candle.timeframe == timeframe,
                )
                .order_by(Candle.timestamp.asc())
            ).all()
        mark("db_load", started)

        started = time.perf_counter()
        candles = [
            CandlePoint(
                timestamp=row.timestamp,
                open=row.open,
                high=row.high,
                low=row.low,
                close=row.close,
                volume=row.volume,
            )
            for row in rows
        ]
        mark("candle_conversion", started)

        if len(candles) < pattern_length + 1:
            raise ValueError("Not enough candles to perform pattern search")

        started = time.perf_counter()
        current = PatternWindow(
            symbol=symbol,
            timeframe=timeframe,
            start_time=candles[-pattern_length].timestamp,
            end_time=candles[-1].timestamp,
            candles=tuple(candles[-pattern_length:]),
        )
        mark("current_window", started)

        started = time.perf_counter()
        store = build_numerical_store(candles, pattern_length)
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
        all_outcomes = []
        timestamp_to_index = {
            candle.timestamp: index for index, candle in enumerate(candles)
        }

        for match in matches:
            start_index = timestamp_to_index[match.start_time]
            matched_window = PatternWindow(
                symbol=symbol,
                timeframe=timeframe,
                start_time=match.start_time,
                end_time=match.end_time,
                candles=tuple(candles[start_index : start_index + pattern_length]),
            )

            future = [
                candle
                for candle in candles
                if candle.timestamp > matched_window.end_time
            ]

            outcomes = calculate_outcomes(
                match=matched_window,
                future_candles=future,
            )
            all_outcomes.extend(outcomes)

            match_results.append(
                {
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
                }
            )
        mark("outcomes", started)

        started = time.perf_counter()
        statistics = calculate_statistics(all_outcomes)

        response = {
            "symbol": symbol,
            "timeframe": timeframe,
            "pattern_length": pattern_length,
            "algorithm_version": ranker.algorithm.version,
            "feature_version": ranker.algorithm.feature_version,
            "current_pattern": {
                "start_time": current.start_time,
                "end_time": current.end_time,
            },
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
        }
        mark("response_build", started)

        if profile:
            total = sum(timings.values())
            print(
                "PATTERN_SEARCH_PROFILE "
                + " ".join(f"{name}={value:.4f}s" for name, value in timings.items())
                + f" total_stages={total:.4f}s candles={len(candles)}"
            )

        return response
