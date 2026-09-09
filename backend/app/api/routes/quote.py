from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.app.auth.user_auth import require_permission, require_user
from backend.app.db.session import get_db
from backend.app.models.instrument import Instrument
from market_data.providers.binance_tickers import BinanceTickerProvider
from market_data.providers.yahoo import YahooFinanceProvider

router = APIRouter(prefix="/api/v1", tags=["market"])


@router.get("/quote")
def get_quote(request: Request, symbol: str = Query(..., min_length=2, max_length=50), db: Session = Depends(get_db)):
    user = require_user(request, db)
    require_permission(user, "market_memory.view")
    normalized = symbol.strip().upper()
    instrument = db.execute(select(Instrument).where(Instrument.symbol == normalized)).scalar_one_or_none()
    if instrument is not None and instrument.provider == "yahoo":
        try:
            ticker = YahooFinanceProvider().quote(normalized)
        except Exception as exc:
            raise HTTPException(status_code=502, detail="Yahoo Finance quote unavailable") from exc
        return {"symbol": ticker.symbol, "price": ticker.price, "change_percent_24h": ticker.change_percent, "quote_volume_24h": None, "provider": "yahoo", "currency": ticker.currency}

    ticker = BinanceTickerProvider().get_24h_ticker(normalized)
    return {"symbol": ticker.symbol, "price": ticker.last_price, "change_percent_24h": ticker.price_change_percent, "quote_volume_24h": ticker.quote_volume, "provider": "binance"}
