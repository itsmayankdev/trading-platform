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
        historical_window: dict[str, str] | None = None,
        current_enabled: bool = True,
        favorites_enabled: bool = False,
        historical_enabled: bool = False,
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

        def historical_agreement(start_index: int, limit: int = 10) -> tuple[float | None, int]:
            directions: list[int] = []
            examined = 0
            for index in range(start_index, len(rows) - pattern_length):
                window_rows = rows[index : index + pattern_length]
                if window_rows[-1].timestamp >= current.start_time:
                    break
                future_rows = rows[index + pattern_length : index + pattern_length + 60]
                if not future_rows:
                    continue
                entry = window_rows[-1].close
                final = future_rows[-1].close
                change = final / entry - 1.0
                if change == 0:
                    continue
                directions.append(1 if change > 0 else -1)
                examined += 1
                if examined >= limit:
                    break
            if not directions:
                return None, 0
            bullish = sum(direction > 0 for direction in directions)
            bearish = len(directions) - bullish
            return 100.0 * max(bullish, bearish) / len(directions), len(directions)

        if current_enabled:
            candidates: list[tuple[float, int]] = []
            for start_index in range(0, len(rows) - pattern_length):
                historical_rows = rows[start_index : start_index + pattern_length]
                if historical_rows[-1].timestamp >= current.start_time:
                    break
                historical = make_window(historical_rows)
                similarity = scorer.score(current, historical) * 100
                candidates.append((similarity, start_index))

            candidates.sort(key=lambda item: item[0], reverse=True)
            best_similarity = candidates[0][0] if candidates else 0.0
            best_index = candidates[0][1] if candidates else None
            best_start = rows[best_index].timestamp if best_index is not None else None
            best_end = rows[best_index + pattern_length - 1].timestamp if best_index is not None else None
            agreement_value = None
            agreement_sample = 0
            if best_index is not None:
                agreement_value, agreement_sample = historical_agreement(best_index)
            similarity_pass = best_similarity >= minimum_similarity
            agreement_pass = agreement_value is not None and agreement_value >= minimum_agreement
            filters_pass = similarity_pass and (not use_historical_filters or agreement_pass)
            source_results.append({
                "source": "current",
                "matched": filters_pass,
                "similarity": round(best_similarity, 4),
                "direction_agreement": round(agreement_value, 4) if agreement_value is not None else None,
                "agreement_sample": agreement_sample,
                "match_start": best_start,
                "match_end": best_end,
                "reason": (
                    "closest historical analog and its historical direction agreement passed"
                    if filters_pass
                    else "closest historical analog did not pass the configured historical filters"
                ),
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
                similarity_pass = similarity >= minimum_similarity
                favorite_results.append({
                    "id": favorite.get("id"),
                    "matched": similarity_pass,
                    "similarity": round(similarity, 4),
                    "direction_agreement": None,
                    "agreement_applicable": False,
                    "reason": "pinned chart matched the similarity threshold" if similarity_pass else "pinned chart is below the similarity threshold",
                })

            source_results.append({
                "source": "favorites",
                "matched": any(item["matched"] for item in favorite_results) if match_mode == "any" else bool(favorite_results) and all(item["matched"] for item in favorite_results),
                "matches": favorite_results,
            })

        if historical_enabled:
            if historical_window is None:
                raise ValueError("A historical chart must be selected")
            try:
                start_time = datetime.fromisoformat(historical_window["start_time"].replace("Z", "+00:00"))
                end_time = datetime.fromisoformat(historical_window["end_time"].replace("Z", "+00:00"))
            except (KeyError, ValueError) as exc:
                raise ValueError("Historical chart timestamps must be valid ISO timestamps") from exc
            start_index = timestamp_to_index.get(start_time)
            if start_index is None or start_index + pattern_length > len(rows):
                raise ValueError("Selected historical chart is not available in current data")
            target_rows = rows[start_index : start_index + pattern_length]
            if target_rows[-1].timestamp != end_time:
                raise ValueError("Selected historical chart is not a contiguous candle window")
            target = make_window(target_rows)
            similarity = scorer.score(current, target) * 100
            matched = similarity >= minimum_similarity
            source_results.append({
                "source": "historical",
                "matched": matched,
                "similarity": round(similarity, 4),
                "match_start": target.start_time,
                "match_end": target.end_time,
                "direction_agreement": None,
                "agreement_applicable": False,
                "reason": "selected historical chart matched the similarity threshold" if matched else "selected historical chart is below the similarity threshold",
            })

        enabled_sources = [item for item in source_results if item["source"] in {"current", "favorites", "historical"}]
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
