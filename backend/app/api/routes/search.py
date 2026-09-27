from fastapi import APIRouter, HTTPException, Query, Request, Depends
from sqlalchemy.orm import Session
from backend.app.auth.user_auth import require_permission, require_user
from backend.app.core.config import get_settings
from backend.app.db.session import get_db
from backend.app.repositories.instrument import InstrumentRepository
from backend.app.search.service import PatternSearchService
from backend.app.search.latency import run_pattern_search
from backend.app.plan_service import check_search_limit, record_search

import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["pattern-search"])
instrument_repository = InstrumentRepository()
service = PatternSearchService()


@router.get("/pattern-search")
def pattern_search(
    request: Request,
    symbol: str = Query(default="ETHUSDT", min_length=1, max_length=50),
    timeframe: str = Query(default="5m", min_length=1, max_length=10),
    pattern_length: int = Query(default=45, ge=5, le=500),
    top_k: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    user = require_user(request, db)
    require_permission(user, "market_memory.use")
    symbol, timeframe = symbol.upper(), timeframe.lower()
    instrument = instrument_repository.get_by_symbol(db=db, symbol=symbol)
    if instrument is None:
        raise HTTPException(status_code=404, detail=f"Instrument not found: {symbol}")

    try:
        plan, used, limit = check_search_limit(db, user, timeframe, top_k)
    except PermissionError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    key = (instrument.id, symbol, timeframe, pattern_length, top_k)
    try:
        result = run_pattern_search(
            key,
            lambda: service.search(
                instrument_id=instrument.id,
                symbol=symbol,
                timeframe=timeframe,
                pattern_length=pattern_length,
                top_k=top_k,
            ),
        )
    except PermissionError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        # Never hide the real failure behind a generic 500. The old route made
        # every search failure look identical, which forced manual guessing
        # during local startup/debugging.
        logger.exception(
            "Pattern search failed symbol=%s timeframe=%s pattern_length=%s top_k=%s user_id=%s",
            symbol,
            timeframe,
            pattern_length,
            top_k,
            user.id,
        )
        if get_settings().app_env == "development":
            raise HTTPException(
                status_code=500,
                detail=f"Pattern search failed: {type(exc).__name__}: {exc}",
            ) from exc
        raise HTTPException(status_code=500, detail="Pattern search failed") from exc

    # Usage/audit accounting must never turn a successful market-memory search
    # into a user-visible 500. If its table/schema is temporarily unhealthy,
    # keep the search result usable and log the accounting failure.
    try:
        record_search(db, user, symbol, timeframe, pattern_length, top_k)
        used += 1
    except Exception as exc:
        db.rollback()
        logger.exception(
            "Pattern search usage recording failed symbol=%s timeframe=%s user_id=%s",
            symbol,
            timeframe,
            user.id,
        )

    if isinstance(result, dict):
        result["plan"] = {
            "code": plan.code,
            "name": plan.name,
            "status": user.plan_status,
            "searches_today": used,
            "search_limit": limit,
        }
    return result
