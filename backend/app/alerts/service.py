from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.candle import Candle
from backend.app.models.instrument import Instrument
from pattern_engine.algorithms.v1 import SimilarityV1
from pattern_engine.outcomes import calculate_outcomes
from pattern_engine.window import CandlePoint, PatternWindow


class AlertEvaluationService:
    """Evaluate alert conditions against the latest completed candle window."""

    def evaluate(
        self,
        db: Session,
        symbol: str,
        timeframe: str,
        pattern_length: int,
        minimum_similarity: float,
        minimum_agreement: float,
        use_historical_filters: bool,
        favorite_windows: list[dict[str, str]],
        current_enabled: bool = True,
        favorites_enabled: bool = False,
        match_mode: str = "any",
    ) -> dict:
        if not 5 <= pattern_length <= 500:
            raise ValueError("Pattern length must be between 5 and 500")
        if not 0 <= minimum_similarity <= 100:
            raise ValueError("Minimum similarity must be between 0 and 100")
        if not 0 <= minimum_agreement <= 100:
            raise ValueError("Minimum agreement must be between 0 and 100")
        if match_mode not in {"any", "all"}:
            raise ValueError("Match mode must be 'any' or 'all'")

        instrument = db.execute(
            select(Instrument).where(Instrument.symbol == symbol).limit(1)
        ).scalar_one_or_none()
        if instrument is None:
            raise ValueError(f"Instrument not found: {symbol}")

        rows = list(
            db.execute(
                select(Candle.timestamp, Candle.open, Candle.high, Candle.low, Candle.close, Candle.volume)
                .where(Candle.instrument_id == instrument.id, Candle.timeframe == timeframe)
                .order_by(Candle.timestamp.asc())
            ).all()
        )
        if len(rows) < pattern_length + 1:
            raise ValueError("Not enough candles to evaluate alert")

        timestamp_to_index = {row.timestamp: index for index, row in enumerate(rows)}

        def make_window(window_rows: list) -> PatternWindow:
            candles = tuple(
                CandlePoint(
                    timestamp=row.timestamp,
                    open=row.open,
                    high=row.high,
                    low=row.low,
                    close=row.close,
                    volume=row.volume,
                )
                for row in window_rows
            )
            return PatternWindow(
                symbol=symbol,
                timeframe=timeframe,
                start_time=candles[0].timestamp,
                end_time=candles[-1].timestamp,
                candles=candles,
            )

        current = make_window(rows[-pattern_length:])
        scorer = SimilarityV1()
        source_results: list[dict] = []

        if current_enabled:
            best_similarity = 0.0
            best_start: datetime | None = None
            best_end: datetime | None = None
            for start_index in range(0, len(rows) - pattern_length):
                historical_rows = rows[start_index : start_index + pattern_length]
                if historical_rows[-1].timestamp >= current.start_time:
                    break
                historical = make_window(historical_rows)
                similarity = scorer.score(current, historical) * 100
                if similarity > best_similarity:
                    best_similarity = similarity
                    best_start = historical.start_time
                    best_end = historical.end_time
            source_results.append({
                "source": "current",
                "matched": best_similarity >= minimum_similarity,
                "similarity": round(best_similarity, 4),
                "match_start": best_start,
                "match_end": best_end,
                "reason": "closest historical analog reached the similarity threshold" if best_similarity >= minimum_similarity else "closest historical analog is below the similarity threshold",
            })

        if favorites_enabled:
            favorite_results = []
            for favorite in favorite_windows:
                try:
                    start_time = datetime.fromisoformat(favorite["start_time"].replace("Z", "+00:00"))
                    end_time = datetime.fromisoformat(favorite["end_time"].replace("Z", "+00:00"))
                except (KeyError, ValueError) as exc:
                    raise ValueError("Pinned chart timestamps must be valid ISO timestamps") from exc

                start_index = timestamp_to_index.get(start_time)
                if start_index is None or start_index + pattern_length > len(rows):
                    favorite_results.append({"id": favorite.get("id"), "matched": False, "similarity": None, "reason": "pinned chart is not available in current data"})
                    continue

                target_rows = rows[start_index : start_index + pattern_length]
                if target_rows[-1].timestamp != end_time:
                    favorite_results.append({"id": favorite.get("id"), "matched": False, "similarity": None, "reason": "pinned chart is not a contiguous candle window"})
                    continue

                target = make_window(target_rows)
                similarity = scorer.score(current, target) * 100
                future_rows = rows[start_index + pattern_length : start_index + pattern_length + 60]
                future = [
                    CandlePoint(row.timestamp, row.open, row.high, row.low, row.close, row.volume)
                    for row in future_rows
                ]
                outcomes = calculate_outcomes(match=target, future_candles=future)
                horizon_60 = next((item for item in outcomes if item.horizon_candles == 60), None)
                direction_agreement = 100.0 if horizon_60 and horizon_60.forward_return != 0 else 0.0
                filters_pass = not use_historical_filters or (
                    similarity >= minimum_similarity and direction_agreement >= minimum_agreement
                )
                favorite_results.append({
                    "id": favorite.get("id"),
                    "matched": filters_pass,
                    "similarity": round(similarity, 4),
                    "direction_agreement": round(direction_agreement, 4),
                    "historical_return_60": horizon_60.forward_return if horizon_60 else None,
                    "reason": "pinned chart matched" if filters_pass else "pinned chart did not meet configured filters",
                })

            source_results.append({
                "source": "favorites",
                "matched": any(item["matched"] for item in favorite_results) if match_mode == "any" else all(item["matched"] for item in favorite_results),
                "matches": favorite_results,
            })

        enabled_sources = [item for item in source_results if item["source"] in {"current", "favorites"}]
        triggered = (
            any(item["matched"] for item in enabled_sources)
            if match_mode == "any"
            else bool(enabled_sources) and all(item["matched"] for item in enabled_sources)
        )
        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "pattern_length": pattern_length,
            "evaluated_at": current.end_time,
            "triggered": triggered,
            "match_mode": match_mode,
            "algorithm_version": scorer.version,
            "feature_version": scorer.feature_version,
            "current_pattern": {"start_time": current.start_time, "end_time": current.end_time},
            "sources": source_results,
        }
