from __future__ import annotations

from datetime import datetime
from statistics import median

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.models.candle import Candle
from backend.app.repositories.instrument import InstrumentRepository
from pattern_engine.ranking import PatternRanker
from pattern_engine.retrieval.numerical import NumericalWindowStore
from pattern_engine.window import CandlePoint, PatternWindow

router = APIRouter(prefix="/api/v1", tags=["evaluation"])
instrument_repository = InstrumentRepository()
HORIZONS = (5, 15, 30, 60)
REGIME_LOOKBACK = 60
VOL_LOOKBACK = 20
VOL_REFERENCE = 240


def _window(rows, start: int, length: int, symbol: str, timeframe: str) -> PatternWindow:
    selected = rows[start : start + length]
    return PatternWindow(
        symbol=symbol,
        timeframe=timeframe,
        start_time=selected[0].timestamp,
        end_time=selected[-1].timestamp,
        candles=tuple(
            CandlePoint(timestamp=r.timestamp, open=r.open, high=r.high, low=r.low, close=r.close, volume=r.volume)
            for r in selected
        ),
    )


def _forward(rows, end_index: int, horizon: int):
    future = rows[end_index + 1 : end_index + 1 + horizon]
    if len(future) < horizon:
        return None
    entry = rows[end_index].close
    if entry <= 0:
        return None
    return {
        "return": future[-1].close / entry - 1.0,
        "mfe": max(r.high for r in future) / entry - 1.0,
        "mae": min(r.low for r in future) / entry - 1.0,
    }


def _regime(rows, end_index: int) -> str | None:
    """Classify the market using information available at end_index only.

    Trend is a 60-candle return. Volatility is the current 20-candle realized
    return volatility versus the median of prior 20-candle volatilities over
    the preceding 240 candles. No future candles are consulted.
    """
    if end_index < REGIME_LOOKBACK + VOL_LOOKBACK + VOL_REFERENCE:
        return None
    closes = [float(rows[i].close) for i in range(end_index - REGIME_LOOKBACK, end_index + 1)]
    if closes[0] <= 0:
        return None
    trend_return = closes[-1] / closes[0] - 1.0
    if trend_return > 0.02:
        trend = "bull"
    elif trend_return < -0.02:
        trend = "bear"
    else:
        trend = "sideways"

    def realized_vol(idx: int) -> float:
        values = []
        start = idx - VOL_LOOKBACK + 1
        for j in range(start, idx + 1):
            prev = float(rows[j - 1].close)
            cur = float(rows[j].close)
            if prev > 0 and cur > 0:
                values.append(cur / prev - 1.0)
        if len(values) < 2:
            return 0.0
        mean = sum(values) / len(values)
        return (sum((v - mean) ** 2 for v in values) / len(values)) ** 0.5

    current_vol = realized_vol(end_index)
    reference = [realized_vol(i) for i in range(end_index - VOL_REFERENCE + 1, end_index - VOL_LOOKBACK + 1)]
    reference = [v for v in reference if v > 0]
    if not reference:
        vol = "normal"
    else:
        reference_median = median(reference)
        if reference_median <= 0:
            vol = "normal"
        elif current_vol > reference_median * 1.5:
            vol = "high_vol"
        elif current_vol < reference_median * 0.67:
            vol = "low_vol"
        else:
            vol = "normal_vol"
    return f"{trend}_{vol}"


@router.get("/evaluation")
def evaluation(
    symbol: str = Query(default="ETHUSDT", min_length=1, max_length=50),
    timeframe: str = Query(default="5m", min_length=1, max_length=10),
    pattern_length: int = Query(default=45, ge=5, le=500),
    top_k: int = Query(default=10, ge=1, le=50),
    start_time: datetime | None = Query(default=None),
    end_time: datetime | None = Query(default=None),
    checkpoints: int = Query(default=12, ge=3, le=30),
    db: Session = Depends(get_db),
):
    symbol = symbol.upper()
    timeframe = timeframe.lower()
    instrument = instrument_repository.get_by_symbol(db=db, symbol=symbol)
    if instrument is None:
        raise HTTPException(status_code=404, detail=f"Instrument not found: {symbol}")

    rows = list(
        db.execute(
            select(Candle.timestamp, Candle.open, Candle.high, Candle.low, Candle.close, Candle.volume)
            .where(Candle.instrument_id == instrument.id, Candle.timeframe == timeframe)
            .order_by(Candle.timestamp.asc())
        ).all()
    )
    if len(rows) < pattern_length + max(HORIZONS) + 20:
        raise HTTPException(status_code=400, detail="Not enough candles for evaluation")

    timestamps = [r.timestamp for r in rows]
    minimum_history_end = (pattern_length * 2) - 1
    start_idx = max(minimum_history_end, pattern_length - 1)
    if start_time is not None:
        start_idx = max(start_idx, next((i for i, t in enumerate(timestamps) if t >= start_time), start_idx))

    end_idx = len(rows) - max(HORIZONS) - 1
    if end_time is not None:
        end_idx = min(end_idx, max(0, next((i for i, t in enumerate(timestamps) if t > end_time), len(timestamps)) - 1))
    if end_idx <= start_idx:
        raise HTTPException(status_code=400, detail="Evaluation range is too small for the selected pattern and horizon")

    usable = end_idx - start_idx + 1
    step = max(1, usable // checkpoints)
    checkpoint_indices = list(range(start_idx, end_idx + 1, step))[:checkpoints]
    if checkpoint_indices[-1] != end_idx and len(checkpoint_indices) < checkpoints:
        checkpoint_indices.append(end_idx)
    checkpoint_indices = sorted(set(checkpoint_indices))

    ranker = PatternRanker()
    evaluations = []
    timestamp_to_index = {timestamp: i for i, timestamp in enumerate(timestamps)}

    for current_end in checkpoint_indices:
        current_start = current_end - pattern_length + 1
        current = _window(rows, current_start, pattern_length, symbol, timeframe)
        current_regime = _regime(rows, current_end)

        checkpoint_rows = rows[: current_end + 1]
        store = NumericalWindowStore.from_columns(
            timestamps=[r.timestamp for r in checkpoint_rows],
            closes=[r.close for r in checkpoint_rows],
            window_length=pattern_length,
        )
        matches = ranker.rank_numerical_v1(
            current=current,
            store=store,
            top_k=top_k,
            min_separation_candles=pattern_length,
        )

        top_rows = []
        regime_counts: dict[str, int] = {}
        same_regime = 0
        for match in matches:
            match_end = timestamp_to_index.get(match.end_time)
            if match_end is None:
                continue
            match_regime = _regime(rows, match_end)
            if match_regime is not None:
                regime_counts[match_regime] = regime_counts.get(match_regime, 0) + 1
                if current_regime is not None and match_regime == current_regime:
                    same_regime += 1
            outcomes = {str(h): _forward(rows, match_end, h) for h in HORIZONS}
            top_rows.append({
                "similarity": match.similarity_score * 100,
                "end_time": match.end_time,
                "regime": match_regime,
                "outcomes": outcomes,
            })

        baseline = {}
        eligible_end = min(current_start - 1, len(rows) - max(HORIZONS) - 1)
        for h in HORIZONS:
            values = []
            for end in range(pattern_length - 1, eligible_end + 1):
                outcome = _forward(rows, end, h)
                if outcome is not None:
                    values.append(outcome["return"])
            baseline[str(h)] = sum(values) / len(values) if values else None

        aggregates = {}
        same_regime_aggregates = {}
        for h in HORIZONS:
            values = [m["outcomes"][str(h)]["return"] for m in top_rows if m["outcomes"].get(str(h)) is not None]
            mfe = [m["outcomes"][str(h)]["mfe"] for m in top_rows if m["outcomes"].get(str(h)) is not None]
            mae = [m["outcomes"][str(h)]["mae"] for m in top_rows if m["outcomes"].get(str(h)) is not None]
            mean_return = sum(values) / len(values) if values else None
            aggregates[str(h)] = {
                "sample_size": len(values),
                "mean_return": mean_return,
                "win_rate": sum(1 for v in values if v > 0) / len(values) if values else None,
                "mean_mfe": sum(mfe) / len(mfe) if mfe else None,
                "mean_mae": sum(mae) / len(mae) if mae else None,
                "baseline_mean_return": baseline[str(h)],
                "edge_vs_baseline": (mean_return - baseline[str(h)]) if mean_return is not None and baseline[str(h)] is not None else None,
            }
            same_values = [
                m["outcomes"][str(h)]["return"] for m in top_rows
                if m.get("regime") is not None and current_regime is not None and m["regime"] == current_regime
                and m["outcomes"].get(str(h)) is not None
            ]
            same_regime_aggregates[str(h)] = {
                "sample_size": len(same_values),
                "mean_return": sum(same_values) / len(same_values) if same_values else None,
                "win_rate": sum(1 for v in same_values if v > 0) / len(same_values) if same_values else None,
            }

        evaluations.append({
            "replay_time": current.end_time,
            "pattern_start": current.start_time,
            "matches_found": len(top_rows),
            "top_match_similarity": top_rows[0]["similarity"] if top_rows else None,
            "current_regime": current_regime,
            "regime_match_counts": regime_counts,
            "same_regime_match_fraction": same_regime / len(top_rows) if top_rows and current_regime is not None else None,
            "same_regime_aggregates": same_regime_aggregates,
            "aggregates": aggregates,
        })

    stability = {}
    for h in HORIZONS:
        values = [c["aggregates"][str(h)]["mean_return"] for c in evaluations if c["aggregates"][str(h)]["mean_return"] is not None]
        edges = [c["aggregates"][str(h)]["edge_vs_baseline"] for c in evaluations if c["aggregates"][str(h)]["edge_vs_baseline"] is not None]
        positive_return_checkpoints = sum(1 for v in values if v > 0)
        positive_edge_checkpoints = sum(1 for v in edges if v > 0)
        stability[str(h)] = {
            "checkpoint_count": len(values),
            "positive_return_checkpoints": positive_return_checkpoints,
            "positive_return_fraction": positive_return_checkpoints / len(values) if values else None,
            "positive_edge_checkpoints": positive_edge_checkpoints,
            "positive_edge_fraction": positive_edge_checkpoints / len(edges) if edges else None,
            "mean_return": sum(values) / len(values) if values else None,
            "median_return": median(values) if values else None,
            "mean_edge_vs_baseline": sum(edges) / len(edges) if edges else None,
            "median_edge_vs_baseline": median(edges) if edges else None,
        }

    regime_totals: dict[str, int] = {}
    same_regime_fractions = []
    for checkpoint in evaluations:
        if checkpoint["current_regime"]:
            regime_totals[checkpoint["current_regime"]] = regime_totals.get(checkpoint["current_regime"], 0) + 1
        if checkpoint["same_regime_match_fraction"] is not None:
            same_regime_fractions.append(checkpoint["same_regime_match_fraction"])

    similarities = [c["top_match_similarity"] for c in evaluations if c["top_match_similarity"] is not None]
    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "pattern_length": pattern_length,
        "top_k": top_k,
        "available_start_time": timestamps[0],
        "available_end_time": timestamps[-1],
        "evaluation_start_time": rows[checkpoint_indices[0]].timestamp,
        "evaluation_end_time": rows[checkpoint_indices[-1]].timestamp,
        "checkpoints": evaluations,
        "horizons": list(HORIZONS),
        "stability": stability,
        "similarity_stability": {
            "checkpoint_count": len(similarities),
            "min": min(similarities) if similarities else None,
            "median": median(similarities) if similarities else None,
            "max": max(similarities) if similarities else None,
        },
        "regime_analysis": {
            "definitions": {
                "trend": "60-candle return: bull > +2%, bear < -2%, otherwise sideways",
                "volatility": "current 20-candle realized volatility vs prior 240-candle median",
                "volatility_buckets": "high > 1.5x reference, low < 0.67x, otherwise normal",
            },
            "checkpoint_regimes": regime_totals,
            "median_same_regime_match_fraction": median(same_regime_fractions) if same_regime_fractions else None,
        },
    }
