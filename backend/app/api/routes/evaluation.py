from __future__ import annotations

from datetime import datetime
from statistics import median

import numpy as np
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
REGIME_TREND_LOOKBACK = 60
REGIME_VOL_LOOKBACK = 20
REGIME_VOL_REFERENCE = 240


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


def _regime_from_closes(closes: np.ndarray, end_index: int) -> dict[str, str | float | None]:
    """Classify trend and volatility using only candles ending at end_index."""
    if end_index < 1:
        return {"trend": None, "volatility": None, "label": None, "trend_return": None, "volatility_ratio": None}

    trend_start = max(0, end_index - REGIME_TREND_LOOKBACK + 1)
    trend_base = float(closes[trend_start])
    trend_return = float(closes[end_index] / trend_base - 1.0) if trend_base > 0 else 0.0
    if trend_return >= 0.01:
        trend = "bull"
    elif trend_return <= -0.01:
        trend = "bear"
    else:
        trend = "sideways"

    ret_start = max(1, end_index - REGIME_VOL_LOOKBACK + 1)
    log_returns = np.diff(np.log(closes[ret_start - 1 : end_index + 1]))
    volatility = float(np.std(log_returns, ddof=0)) if len(log_returns) else 0.0

    ref_end = end_index - REGIME_VOL_LOOKBACK
    ref_start = max(REGIME_VOL_LOOKBACK, ref_end - REGIME_VOL_REFERENCE + 1)
    reference_values: list[float] = []
    if ref_end >= ref_start:
        for idx in range(ref_start, ref_end + 1):
            a = max(1, idx - REGIME_VOL_LOOKBACK + 1)
            vals = np.diff(np.log(closes[a - 1 : idx + 1]))
            if len(vals):
                reference_values.append(float(np.std(vals, ddof=0)))
    reference = float(np.median(reference_values)) if reference_values else volatility
    ratio = volatility / reference if reference > 0 else 1.0
    if ratio >= 1.25:
        vol_bucket = "high"
    elif ratio <= 0.80:
        vol_bucket = "low"
    else:
        vol_bucket = "normal"

    return {
        "trend": trend,
        "volatility": vol_bucket,
        "label": f"{trend}_{vol_bucket}",
        "trend_return": trend_return,
        "volatility_ratio": ratio,
    }


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
    closes = np.asarray([float(r.close) for r in rows], dtype=np.float64)
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
    regime_cache: dict[int, dict] = {}

    def regime_at(index: int) -> dict:
        if index not in regime_cache:
            regime_cache[index] = _regime_from_closes(closes, index)
        return regime_cache[index]

    for current_end in checkpoint_indices:
        current_start = current_end - pattern_length + 1
        current = _window(rows, current_start, pattern_length, symbol, timeframe)
        current_regime = regime_at(current_end)

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
        for match in matches:
            match_end = timestamp_to_index.get(match.end_time)
            if match_end is None:
                continue
            outcomes = {str(h): _forward(rows, match_end, h) for h in HORIZONS}
            match_regime = regime_at(match_end)
            top_rows.append({
                "similarity": match.similarity_score * 100,
                "end_time": match.end_time,
                "outcomes": outcomes,
                "regime": match_regime,
                "same_regime": match_regime.get("label") == current_regime.get("label"),
            })

        # Unconditional baseline is computed only from outcomes known before the checkpoint.
        # Vectorized calculation keeps large 5m datasets practical.
        baseline = {}
        eligible_end = min(current_start - 1, len(rows) - max(HORIZONS) - 1)
        base_ends = np.arange(pattern_length - 1, eligible_end + 1, dtype=np.int64)
        entry = closes[base_ends] if len(base_ends) else np.array([], dtype=np.float64)
        for h in HORIZONS:
            if len(base_ends):
                values = closes[base_ends + h] / entry - 1.0
                values = values[np.isfinite(values) & (entry > 0)]
                baseline[str(h)] = float(np.mean(values)) if len(values) else None
            else:
                baseline[str(h)] = None

        aggregates = {}
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

        same_count = sum(1 for m in top_rows if m["same_regime"])
        regime_counts: dict[str, int] = {}
        for m in top_rows:
            label = m["regime"].get("label")
            if label:
                regime_counts[label] = regime_counts.get(label, 0) + 1

        evaluations.append({
            "replay_time": current.end_time,
            "pattern_start": current.start_time,
            "matches_found": len(top_rows),
            "top_match_similarity": top_rows[0]["similarity"] if top_rows else None,
            "current_regime": current_regime,
            "same_regime_match_fraction": same_count / len(top_rows) if top_rows else None,
            "match_regime_distribution": regime_counts,
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

    similarities = [c["top_match_similarity"] for c in evaluations if c["top_match_similarity"] is not None]
    same_regime_values = [c["same_regime_match_fraction"] for c in evaluations if c["same_regime_match_fraction"] is not None]
    regime_counts: dict[str, int] = {}
    for checkpoint in evaluations:
        label = checkpoint["current_regime"].get("label") if checkpoint.get("current_regime") else None
        if label:
            regime_counts[label] = regime_counts.get(label, 0) + 1

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
            "checkpoint_count": len(same_regime_values),
            "median_same_regime_match_fraction": median(same_regime_values) if same_regime_values else None,
            "regimes_observed": regime_counts,
        },
    }
