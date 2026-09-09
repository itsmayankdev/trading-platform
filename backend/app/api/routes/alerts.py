from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from backend.app.alerts.service import AlertEvaluationService
from backend.app.auth.user_auth import require_permission, require_user
from backend.app.db.session import get_db
from workers.ingestion.on_demand import ensure_market_data

router = APIRouter(prefix="/api/v1/alerts", tags=["alerts"])
service = AlertEvaluationService()
class PatternWindowRequest(BaseModel): start_time: str; end_time: str
class FavoriteWindow(PatternWindowRequest): id: str = Field(min_length=1, max_length=100)
class AlertEvaluationRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=50); timeframe: str = Field(min_length=1, max_length=10); pattern_length: int = Field(default=45, ge=5, le=500); minimum_similarity: float = Field(default=95, ge=0, le=100); minimum_agreement: float = Field(default=60, ge=0, le=100); use_historical_filters: bool = True; current_enabled: bool = True; favorites_enabled: bool = False; historical_enabled: bool = False; named_enabled: bool = False; named_patterns: list[str] = Field(default_factory=list, max_length=10); match_mode: str = Field(default="any", pattern="^(any|all)$"); favorite_windows: list[FavoriteWindow] = Field(default_factory=list, max_length=50); historical_window: PatternWindowRequest | None = None
@router.post("/evaluate")
def evaluate_alert(request: Request, body: AlertEvaluationRequest, db: Session = Depends(get_db)):
    user=require_user(request,db); require_permission(user,"alerts.use")
    try:
        ensure_market_data(symbol=body.symbol.upper(), timeframe=body.timeframe.lower(), minimum_candles=body.pattern_length + 1)
        db.expire_all()
        return service.evaluate(db=db,symbol=body.symbol.upper(),timeframe=body.timeframe.lower(),pattern_length=body.pattern_length,minimum_similarity=body.minimum_similarity,minimum_agreement=body.minimum_agreement,use_historical_filters=body.use_historical_filters,favorite_windows=[item.model_dump() for item in body.favorite_windows],historical_window=body.historical_window.model_dump() if body.historical_window else None,current_enabled=body.current_enabled,favorites_enabled=body.favorites_enabled,historical_enabled=body.historical_enabled,named_enabled=body.named_enabled,named_patterns=body.named_patterns,match_mode=body.match_mode)
    except ValueError as exc: raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        print(f"Alert evaluation failed for {body.symbol}: {exc}", flush=True)
        raise HTTPException(status_code=500, detail="Alert evaluation failed") from exc
