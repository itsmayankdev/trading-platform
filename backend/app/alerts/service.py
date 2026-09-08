from __future__ import annotations

from datetime import datetime

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from backend.app.models.candle import Candle
from pattern_engine.algorithms.v1 import SimilarityV1
from pattern_engine.outcomes import calculate_outcomes
from pattern_engine.window import CandlePoint, PatternWindow


class AlertEvaluationService:
    """Evaluate alert conditions against the latest completed candle window.

    This is intentionally evaluation-only: it does not send notifications or
    persist user rules. Keeping evaluation separate lets notification/auth
    infrastructure be added later without changing the analytical contract.
    """

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
        if pattern_length < 5 or pattern_length > 500:
            raise ValueError("Pattern length must be between 5 and 500")
        if not 0 <= minimum_similarity <= 100:
            raise ValueError("Minimum similarity must be between 0 and 100")
        if not 0 <= minimum_agreement <= 100:
            raise ValueError("Minimum agreement must be between 0 and 100")
        if match_mode not in {"any", "all"}:
            raise ValueError("Match mode must be 'any' or 'all'")

        instrument = db.execute(
            select(Candle.instrument_id)
            .join(Candle.instrument)
            .where(Candle.instrument.has(symbol=symbol), Candle.timeframe == timeframe)
            .order_by(desc(Candle.timestamp))
            .limit(1)
        ).scalar_one_or_none()
        if instrument is None:
            raise ValueError(f"No candle data found for {symbol} {timeframe}")

        rows = list(
            db.execute(
                select(Candle.timestamp, Candle.open, Candle.high, Candle.low, Candle.close, Candle.volume)
                .where(Candle.instrument_id == instrument, Candle.timeframe == timeframe)
                .order_by(Candle.timestamp.asc())
            ).all()
        )
        if len(rows) < pattern_length + 1:
            raise ValueError("Not enough candles to evaluate alert")

        def window_from_rows(window_rows: list) -> PatternWindow:
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

        current = window_from_rows(rows[-pattern_length:])
        scorer = SimilarityV1()
        source_results: list[dict] = []

        if current_enabled:
            # Current-structure alerts use the closest historical analog. The
            # search is deliberately causal: only windows ending before the
            # current window start are eligible.
            best_similarity = 0.0
            best_start: datetime | None = None
            best_end: datetime | None = None
            for start_index in range(0, len(rows) - pattern_length):
                end_index = start_index + pattern_length
                historical_rows = rows[start_index:end_index]
                if historical_rows[-1].timestamp >= current.start_time:
                    break
                historical = window_from_rows(historical_rows)
                similarity = scorer.score(current, historical) * 100
                if similarity > best_similarity:
                    best_similarity = similarity
                    best_start = historical.start_time
                    best_end = historical.end_time

            hit = best_similarity >= minimum_similarity
            source_results.append({
                "source": "current",
                "matched": hit,
                "similarity": round(best_similarity, 4),
                "match_start": best_start,
                "match_end": best_end,
                "reason": "closest historical analog reached the similarity threshold" if hit else "closest historical analog is below the similarity threshold",
            })

        if favorites_enabled:
            if not favorite_windows:
                source_results.append({
                    "source": "favorites",
                    "matched": False,
                    "matches": [],
                    "reason": "no pinned chart windows supplied",
                })
            else:
                favorite_results = []
                for favorite in favorite_windows:
                    try:
                        start_time = datetime.fromisoformat(favorite["start_time"].replace("Z", "+00:00"))
                        end_time = datetime.fromisoformat(favorite["end_time"].replace("Z", "+00:00"))
                    except (KeyError, ValueError) as exc:
                        raise ValueError("Pinned chart timestamps must be valid ISO timestamps") from exc

                    target_rows = [row for row in rows if start_time <= row.timestamp <= end_time]
                    if len(target_rows) != pattern_length:
                        favorite_results.append({
                            "id": favorite.get("id"),
                            "matched": False,
                            "similarity": None,
                            "reason": "pinned chart is not available as an exact window in the current data",
                        })
                        continue

                    target = window_from_rows(target_rows)
                    similarity = scorer.score(current, target) * 100
                    outcomes = calculate_outcomes(target, rows[rows.index(target_rows[-1]) + 1 : rows.index(target_rows[-1]) + 61])
                    horizon_60 = next((item for item in outcomes if item.horizon_candles == 60), None)
                    agreement = abs(horizon_60.forward_return) if horizon_60 else 0.0
                    # A pinned chart is considered directionally confirmed only
                    # when its own historical continuation has a non-zero move.
                    direction_agreement = 100.0 if horizon_60 and horizon_60.forward_return != 0 else 0.0
                    filters_pass = (not use_historical_filters) or (
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
        triggered = any(item["matched"] for item in enabled_sources) if match_mode == "any" else bool(enabled_sources) and all(item["matched"] for item in enabled_sources)
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
