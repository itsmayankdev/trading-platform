from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from backend.app.auth.user_auth import require_permission, require_user
from backend.app.db.session import get_db
from backend.app.services.instrument_sync import InstrumentSyncService
from market_data.providers.binance_tickers import BinanceTickerProvider

router = APIRouter(prefix="/api/v1", tags=["market"])


@router.get("/quote")
def get_quote(
    request: Request,
    symbol: str = Query(..., min_length=2, max_length=40),
    db: Session = Depends(get_db),
):
    user = require_user(request, db)
    require_permission(user, "market_memory.view")

    normalized = symbol.strip().upper()
    ticker = BinanceTickerProvider().get_24h_ticker(normalized)
    return {
        "symbol": ticker.symbol,
        "price": ticker.last_price,
        "change_percent_24h": ticker.price_change_percent,
        "quote_volume_24h": ticker.quote_volume,
    }
