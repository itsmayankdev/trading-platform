from sqlalchemy import select

from backend.app.db.session import SessionLocal
from backend.app.models.candle import Candle

from pattern_engine.window import CandlePoint
from pattern_engine.window_builder import build_windows
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

        with SessionLocal() as db:

            rows = db.execute(
                select(Candle)
                .where(
                    Candle.instrument_id == instrument_id,
                    Candle.timeframe == timeframe,
                )
                .order_by(Candle.timestamp.asc())
            ).scalars().all()

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

        windows = build_windows(
            symbol=symbol,
            timeframe=timeframe,
            candles=candles,
            window_length=pattern_length,
        )

        if len(windows) < 2:
            raise ValueError(
                "Not enough candles to perform pattern search"
            )

        current = windows[-1]

        historical = [
            window
            for window in windows
            if window.end_time < current.start_time
        ]

        ranker = PatternRanker()

        matches = ranker.rank(
            current=current,
            historical_windows=historical,
            top_k=top_k,
            min_separation_candles=pattern_length,
        )

        match_results = []
        all_outcomes = []

        for match in matches:

            matched_window = next(
                window
                for window in historical
                if window.start_time == match.start_time
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
                    "similarity_score": round(
                        match.similarity_score * 100,
                        4,
                    ),
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

        statistics = calculate_statistics(
            all_outcomes
        )

        return {
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
