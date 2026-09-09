from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.auth.user_auth import require_permission, require_user
from backend.app.db.session import get_db
from backend.app.models.instrument import Instrument
from market_data.providers.yahoo import YahooFinanceProvider

router = APIRouter(prefix="/api/v1/global-markets", tags=["global-markets"])
provider = YahooFinanceProvider()


def _require(request: Request, db: Session):
    user = require_user(request, db)
    require_permission(user, "market_memory.view")
    return user


@router.get("/search")
def search_global_markets(
    request: Request,
    q: str = Query(..., min_length=1, max_length=80),
    limit: int = Query(default=12, ge=1, le=20),
    db: Session = Depends(get_db),
):
    _require(request, db)
    try:
        results = provider.search(q, limit)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Global market search is temporarily unavailable") from exc
    return {
        "source": "yahoo",
        "markets": [
            {
                "symbol": item.symbol,
                "name": item.name,
                "exchange": item.exchange,
                "quote_type": item.quote_type,
                "currency": item.currency,
                "score": item.score,
            }
            for item in results
        ],
    }


@router.post("/select")
def select_global_market(
    request: Request,
    symbol: str = Query(..., min_length=1, max_length=50),
    db: Session = Depends(get_db),
):
    _require(request, db)
    normalized = symbol.strip().upper()
    existing = db.execute(select(Instrument).where(Instrument.symbol == normalized)).scalar_one_or_none()
    if existing is not None:
        if existing.provider != "yahoo":
            raise HTTPException(status_code=409, detail="This symbol is already owned by another market provider")
        return {"symbol": normalized, "provider": "yahoo", "instrument_id": existing.id}

    try:
        results = provider.search(normalized, 5)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Unable to validate Yahoo Finance symbol") from exc
    match = next((item for item in results if item.symbol == normalized), None)
    if match is None:
        raise HTTPException(status_code=404, detail=f"Yahoo Finance market not found: {normalized}")

    instrument = Instrument(
        symbol=normalized,
        asset_class=(match.quote_type or "market").lower()[:30],
        exchange=(match.exchange or "yahoo")[:50],
        provider="yahoo",
        base_asset=match.name[:30],
        quote_asset=match.currency[:30] if match.currency else None,
        market_type=(match.quote_type or "market")[:30],
        exchange_status="ACTIVE",
        is_enabled=True,
        market_status="TRADING",
        is_spot_trading_allowed=False,
        is_listed=True,
    )
    db.add(instrument)
    db.commit()
    db.refresh(instrument)
    return {"symbol": normalized, "provider": "yahoo", "instrument_id": instrument.id, "name": match.name, "quote_type": match.quote_type, "exchange": match.exchange, "currency": match.currency}
