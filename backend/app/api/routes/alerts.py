from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.app.alerts.service import AlertEvaluationService
from backend.app.db.session import get_db


router = APIRouter(prefix="/api/v1/alerts", tags=["alerts"])
service = AlertEvaluationService()


class PatternWindowRequest(BaseModel):
    start_time: str
    end_time: str


class FavoriteWindow(PatternWindowRequest):
    id: str = Field(min_length=1, max_length=100)


class AlertEvaluationRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=50)
    timeframe: str = Field(min_length=1, max_length=10)
    pattern_length: int = Field(default=45, ge=5, le=500)
    minimum_similarity: float = Field(default=95, ge=0, le=100)
    minimum_agreement: float = Field(default=60, ge=0, le=100)
    use_historical_filters: bool = True
    current_enabled: bool = True
    favorites_enabled: bool = False
    historical_enabled: bool = False
    named_enabled: bool = False
    named_patterns: list[str] = Field(default_factory=list, max_length=10)
    match_mode: str = Field(default="any", pattern="^(any|all)$")
    favorite_windows: list[FavoriteWindow] = Field(default_factory=list, max_length=50)
    historical_window: PatternWindowRequest | None = None


@router.post("/evaluate")
def evaluate_alert(request: AlertEvaluationRequest, db: Session = Depends(get_db)):
    try:
        return service.evaluate(
            db=db,
            symbol=request.symbol.upper(),
            timeframe=request.timeframe.lower(),
            pattern_length=request.pattern_length,
            minimum_similarity=request.minimum_similarity,
            minimum_agreement=request.minimum_agreement,
            use_historical_filters=request.use_historical_filters,
            favorite_windows=[item.model_dump() for item in request.favorite_windows],
            historical_window=request.historical_window.model_dump() if request.historical_window else None,
            current_enabled=request.current_enabled,
            favorites_enabled=request.favorites_enabled,
            historical_enabled=request.historical_enabled,
            named_enabled=request.named_enabled,
            named_patterns=request.named_patterns,
            match_mode=request.match_mode,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        raise HTTPException(status_code=500, detail="Alert evaluation failed")
