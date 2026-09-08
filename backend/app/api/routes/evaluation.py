from __future__ import annotations

from datetime import datetime

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


def _window(rows, start: int, length: int, symbol: str, timeframe: str) -> PatternWindow:
    selected = rows[start : start + length]
    return PatternWindow(
        symbol=symbol,
        timeframe=timeframe,
        start_time=selected[0].timestamp,
        end_time=selected[-1].timestamp,
        candles=tuple(
            CandlePoint(
                timestamp=r.timestamp,
                open=r.open,
                high=r.high,
                low=r.low,
                close=r.close,
                volume=r.volume,
            )
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
    start_idx = pattern_length - 1
    if start_time is not None:
        start_idx = next((i for i, t in enumerate(timestamps) if t >= start_time), start_idx)
    end_idx = len(rows) - max(HORIZONS) - 1
    if end_time is not None:
        end_idx = min(end_idx, max(0, next((i for i, t in enumerate(timestamps) if t > end_time), len(rows)) - 1))
    start_idx = max(pattern_length - 1, start_idx)
    if end_idx <= start_idx:
        raise HTTPException(status_code=400, detail="Evaluation range is too small for the selected pattern and horizon")

    usable = end_idx - start_idx + 1
    step = max(1, usable // checkpoints)
    checkpoint_indices = list(range(start_idx, end_idx + 1, step))[:checkpoints]
    if checkpoint_indices[-1] != end_idx and len(checkpoint_indices) < checkpoints:
        checkpoint_indices.append(end_idx)
    checkpoint_indices = sorted(set(checkpoint_indices))

    store = NumericalWindowStore.from_columns(timestamps=timestamps, closes=[r.close for r in rows], window_length=pattern_length)
    ranker = PatternRanker()
    evaluations = []

    for current_end in checkpoint_indices:
        current_start = current_end - pattern_length + 1
        current = _window(rows, current_start, pattern_length, symbol, timeframe)
        matches = ranker.rank_numerical_v1(current=current, store=store, top_k=top_k, min_separation_candles=pattern_length)

        top_rows = []
        for match in matches:
            match_end = next((i for i, t in enumerate(timestamps) if t == match.end_time), None)
            if match_end is None:
                continue
            outcomes = {str(h): _forward(rows, match_end, h) for h in HORIZONS}
            top_rows.append({"similarity": match.similarity_score * 100, "end_time": match.end_time, "outcomes": outcomes})

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
        for h in HORIZONS:
            values = [m["outcomes"][str(h)]["return"] for m in top_rows if m["outcomes"].get(str(h)) is not None]
            mfe = [m["outcomes"][str(h)]["mfe"] for m in top_rows if m["outcomes"].get(str(h)) is not None]
            mae = [m["outcomes"][str(h)]["mae"] for m in top_rows if m["outcomes"].get(str(h)) is not None]
            aggregates[str(h)] = {
                "sample_size": len(values),
                "mean_return": sum(values) / len(values) if values else None,
                "win_rate": sum(1 for v in values if v > 0) / len(values) if values else None,
                "mean_mfe": sum(mfe) / len(mfe) if mfe else None,
                "mean_mae": sum(mae) / len(mae) if mae else None,
                "baseline_mean_return": baseline[str(h)],
                "edge_vs_baseline": (sum(values) / len(values) - baseline[str(h)]) if values and baseline[str(h)] is not None else None,
            }

        evaluations.append({
            "replay_time": current.end_time,
            "pattern_start": current.start_time,
            "matches_found": len(top_rows),
            "top_match_similarity": top_rows[0]["similarity"] if top_rows else None,
            "aggregates": aggregates,
        })

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
    }
