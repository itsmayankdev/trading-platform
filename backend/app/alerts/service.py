from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.candle import Candle
from backend.app.models.instrument import Instrument
from backend.app.patterns.live import READY_LIVE_PATTERNS, detect_live_patterns
from pattern_engine.algorithms.v1 import SimilarityV1
from pattern_engine.window import CandlePoint, PatternWindow

_TIMEFRAME_SECONDS = {"1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "2h": 7200, "4h": 14400, "6h": 21600, "8h": 28800, "12h": 43200, "1d": 86400}


class AlertEvaluationService:
    """Evaluate alerts against current market data and optional historical sources."""

    def evaluate(self, db: Session, symbol: str, timeframe: str, pattern_length: int, minimum_similarity: float, minimum_agreement: float, use_historical_filters: bool, favorite_windows: list[dict[str, str]], historical_window: dict[str, str] | None = None, current_enabled: bool = True, favorites_enabled: bool = False, historical_enabled: bool = False, named_enabled: bool = False, named_patterns: list[str] | None = None, match_mode: str = "any") -> dict:
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

        interval_seconds = _TIMEFRAME_SECONDS.get(timeframe)
        now = datetime.now(timezone.utc)
        if interval_seconds:
            rows = [row for row in rows if row.timestamp.replace(tzinfo=timezone.utc).timestamp() + interval_seconds <= now.timestamp()]
        if len(rows) < pattern_length + 1:
            raise ValueError("Not enough completed candles to evaluate alert")

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
            filters_pass = best_similarity >= minimum_similarity and (not use_historical_filters or (agreement_value is not None and agreement_value >= minimum_agreement))
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
            unsupported = [name for name in requested if name not in READY_LIVE_PATTERNS]
            if unsupported:
                raise ValueError(f"Live detection is not ready for: {', '.join(unsupported)}")

            # Named-pattern alerts are intentionally scoped to the exact live chart
            # window selected by pattern_length. Historical candles are never used by
            # the named detector as evidence for a live named-pattern trigger.
            live_candle_count = pattern_length
            live_rows = rows[-live_candle_count:]
            live_matches = detect_live_patterns(live_rows, requested, live_candle_count)
            matched_names = {item["name"] for item in live_matches}
            named_results = []
            for name in requested:
                match = next((item for item in live_matches if item["name"] == name), None)
                named_results.append({"name": name, "matched": match is not None, "start_time": match["start_time"] if match else None, "end_time": match["end_time"] if match else None, "detected_at": match["detected_at"] if match else None, "candle_count": match["candle_count"] if match else 0, "reason": match["reason"] if match else f"{name} was not found in the selected {len(live_rows)} completed chart candles"})
            matched_details = [f"{item['name']} at {item['detected_at'].isoformat()} UTC" for item in live_matches]
            source_results.append({"source": "named", "matched": any(name in matched_names for name in requested) if match_mode == "any" else bool(requested) and all(name in matched_names for name in requested), "matches": named_results, "chart_scope": "live", "scanned_candles": len(live_rows), "chart_start": live_rows[0].timestamp, "chart_end": live_rows[-1].timestamp, "reason": ("LIVE CHART MATCH — " + "; ".join(matched_details)) if live_matches else f"No selected named pattern found in the selected {len(live_rows)} completed candles of the live chart"})

        triggered = any(item["matched"] for item in source_results) if match_mode == "any" else bool(source_results) and all(item["matched"] for item in source_results)
        return {"symbol": symbol, "timeframe": timeframe, "pattern_length": pattern_length, "evaluated_at": now, "triggered": triggered, "match_mode": match_mode, "algorithm_version": scorer.version, "feature_version": scorer.feature_version, "current_pattern": {"start_time": current.start_time, "end_time": current.end_time}, "sources": source_results}
