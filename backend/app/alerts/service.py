from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.candle import Candle
from backend.app.models.instrument import Instrument
from pattern_engine.algorithms.v1 import SimilarityV1
from pattern_engine.window import CandlePoint, PatternWindow

READY_CANDLE_PATTERNS = {"Doji", "Hammer", "Shooting Star", "Bullish Engulfing", "Bearish Engulfing"}


def _candle_pattern_matches(rows: list, name: str) -> bool:
    if not rows:
        return False

    row = rows[-1]
    body = abs(row.close - row.open)
    candle_range = max(row.high - row.low, 0.0)
    upper = row.high - max(row.open, row.close)
    lower = min(row.open, row.close) - row.low

    if name == "Doji":
        return candle_range > 0 and body / candle_range <= 0.10

    if name == "Hammer":
        return body > 0 and candle_range > 0 and lower >= body * 2 and upper <= body and max(row.open, row.close) >= row.low + candle_range * 0.60

    if name == "Shooting Star":
        return body > 0 and candle_range > 0 and upper >= body * 2 and lower <= body and min(row.open, row.close) <= row.low + candle_range * 0.40

    if name in {"Bullish Engulfing", "Bearish Engulfing"} and len(rows) >= 2:
        previous = rows[-2]
        previous_body = abs(previous.close - previous.open)
        if previous_body <= 0 or body <= 0:
            return False
        if name == "Bullish Engulfing":
            return previous.close < previous.open and row.close > row.open and row.open <= previous.close and row.close >= previous.open and body > previous_body
        return previous.close > previous.open and row.close < row.open and row.open >= previous.close and row.close <= previous.open and body > previous_body

    return False


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
        named_enabled: bool = False,
        named_patterns: list[str] | None = None,
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

        instrument = db.execute(select(Instrument).where(Instrument.symbol == symbol).limit(1)).scalar_one_or_none()
        if instrument is None:
            raise ValueError(f"Instrument not found: {symbol}")

        rows = list(db.execute(select(Candle.timestamp, Candle.open, Candle.high, Candle.low, Candle.close, Candle.volume).where(Candle.instrument_id == instrument.id, Candle.timeframe == timeframe).order_by(Candle.timestamp.asc())).all())
        if len(rows) < pattern_length + 1:
            raise ValueError("Not enough candles to evaluate alert")

        timestamp_to_index = {row.timestamp: index for index, row in enumerate(rows)}

        def make_window(window_rows: list) -> PatternWindow:
            candles = tuple(CandlePoint(timestamp=row.timestamp, open=row.open, high=row.high, low=row.low, close=row.close, volume=row.volume) for row in window_rows)
            return PatternWindow(symbol=symbol, timeframe=timeframe, start_time=candles[0].timestamp, end_time=candles[-1].timestamp, candles=candles)

        current = make_window(rows[-pattern_length:])
        scorer = SimilarityV1()
        source_results: list[dict] = []

        def directional_agreement(candidate_indices: list[int], limit: int = 10) -> tuple[float | None, int]:
            directions: list[int] = []
            for start_index in candidate_indices[:limit]:
                future_rows = rows[start_index + pattern_length : start_index + pattern_length + 60]
                if not future_rows:
                    continue
                entry = rows[start_index + pattern_length - 1].close
                change = future_rows[-1].close / entry - 1.0
                if change > 0:
                    directions.append(1)
                elif change < 0:
                    directions.append(-1)
            if not directions:
                return None, 0
            bullish = sum(direction > 0 for direction in directions)
            return 100.0 * max(bullish, len(directions) - bullish) / len(directions), len(directions)

        if current_enabled:
            candidates: list[tuple[float, int]] = []
            for start_index in range(0, len(rows) - pattern_length):
                historical_rows = rows[start_index : start_index + pattern_length]
                if historical_rows[-1].timestamp >= current.start_time:
                    break
                candidates.append((scorer.score(current, make_window(historical_rows)) * 100, start_index))
            candidates.sort(key=lambda item: item[0], reverse=True)
            best_similarity = candidates[0][0] if candidates else 0.0
            best_index = candidates[0][1] if candidates else None
            agreement_value, agreement_sample = directional_agreement([index for _, index in candidates])
            similarity_pass = best_similarity >= minimum_similarity
            agreement_pass = agreement_value is not None and agreement_value >= minimum_agreement
            filters_pass = similarity_pass and (not use_historical_filters or agreement_pass)
            source_results.append({"source": "current", "matched": filters_pass, "similarity": round(best_similarity, 4), "direction_agreement": round(agreement_value, 4) if agreement_value is not None else None, "agreement_sample": agreement_sample, "match_start": rows[best_index].timestamp if best_index is not None else None, "match_end": rows[best_index + pattern_length - 1].timestamp if best_index is not None else None, "reason": "closest historical analog and its top-match direction agreement passed" if filters_pass else "closest historical analog did not pass the configured historical filters"})

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
                similarity = scorer.score(current, make_window(target_rows)) * 100
                favorite_results.append({"id": favorite.get("id"), "matched": similarity >= minimum_similarity, "similarity": round(similarity, 4), "direction_agreement": None, "agreement_applicable": False, "reason": "pinned chart matched the similarity threshold" if similarity >= minimum_similarity else "pinned chart is below the similarity threshold"})
            source_results.append({"source": "favorites", "matched": any(item["matched"] for item in favorite_results) if match_mode == "any" else bool(favorite_results) and all(item["matched"] for item in favorite_results), "matches": favorite_results})

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
            similarity = scorer.score(current, make_window(target_rows)) * 100
            source_results.append({"source": "historical", "matched": similarity >= minimum_similarity, "similarity": round(similarity, 4), "match_start": target_rows[0].timestamp, "match_end": target_rows[-1].timestamp, "direction_agreement": None, "agreement_applicable": False, "reason": "selected historical chart matched the similarity threshold" if similarity >= minimum_similarity else "selected historical chart is below the similarity threshold"})

        if named_enabled:
            requested = list(dict.fromkeys(named_patterns or []))
            if not requested:
                raise ValueError("Select at least one named pattern")
            unsupported = [name for name in requested if name not in READY_CANDLE_PATTERNS]
            if unsupported:
                raise ValueError(f"Named pattern detection is not ready for: {', '.join(unsupported)}")
            named_results = [{"name": name, "matched": _candle_pattern_matches(rows, name)} for name in requested]
            source_results.append({"source": "named", "matched": any(item["matched"] for item in named_results) if match_mode == "any" else bool(named_results) and all(item["matched"] for item in named_results), "matches": named_results, "reason": "latest completed candle(s) evaluated against the selected candlestick definitions"})

        triggered = any(item["matched"] for item in source_results) if match_mode == "any" else bool(source_results) and all(item["matched"] for item in source_results)
        return {"symbol": symbol, "timeframe": timeframe, "pattern_length": pattern_length, "evaluated_at": current.end_time, "triggered": triggered, "match_mode": match_mode, "algorithm_version": scorer.version, "feature_version": scorer.feature_version, "current_pattern": {"start_time": current.start_time, "end_time": current.end_time}, "sources": source_results}
