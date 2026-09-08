from __future__ import annotations
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.app.auth.user_auth import require_permission, require_user
from backend.app.db.session import get_db
from backend.app.models.candle import Candle
from backend.app.repositories.instrument import InstrumentRepository
from pattern_engine.retrieval.numerical import NumericalWindowStore
from pattern_engine.ranking import PatternRanker
from pattern_engine.window import CandlePoint, PatternWindow

router = APIRouter(prefix="/api/v1", tags=["replay"])
instrument_repository = InstrumentRepository()

@router.get("/replay-search")
def replay_search(request: Request, symbol: str = Query(default="ETHUSDT", min_length=1, max_length=50), timeframe: str = Query(default="5m", min_length=1, max_length=10), pattern_length: int = Query(default=45, ge=5, le=500), top_k: int = Query(default=10, ge=1, le=50), replay_time: datetime = Query(...), db: Session = Depends(get_db)):
    user = require_user(request, db); require_permission(user, "replay.use")
    symbol, timeframe = symbol.upper(), timeframe.lower()
    instrument = instrument_repository.get_by_symbol(db=db, symbol=symbol)
    if instrument is None: raise HTTPException(status_code=404, detail=f"Instrument not found: {symbol}")
    rows = list(db.execute(select(Candle.timestamp, Candle.open, Candle.high, Candle.low, Candle.close, Candle.volume).where(Candle.instrument_id == instrument.id, Candle.timeframe == timeframe, Candle.timestamp <= replay_time).order_by(Candle.timestamp.asc())).all())
    if len(rows) < pattern_length + 1: raise HTTPException(status_code=400, detail="Not enough completed candles before replay time")
    timestamps, closes = [r.timestamp for r in rows], [r.close for r in rows]
    current_rows = rows[-pattern_length:]
    store = NumericalWindowStore.from_columns(timestamps=timestamps, closes=closes, window_length=pattern_length)
    current_start, current_end = current_rows[0].timestamp, current_rows[-1].timestamp
    current = PatternWindow(symbol=symbol, timeframe=timeframe, start_time=current_start, end_time=current_end, candles=tuple(CandlePoint(timestamp=r.timestamp, open=r.open, high=r.high, low=r.low, close=r.close, volume=r.volume) for r in current_rows))
    matches = PatternRanker().rank_numerical_v1(current=current, store=store, top_k=top_k, min_separation_candles=pattern_length)
    return {"symbol": symbol, "timeframe": timeframe, "pattern_length": pattern_length, "replay_time": replay_time, "current_pattern": {"start_time": current_start, "end_time": current_end}, "historical_candles_available": len(rows), "matches": [{"start_time": m.start_time, "end_time": m.end_time, "similarity_score": round(m.similarity_score * 100, 4)} for m in matches]}
