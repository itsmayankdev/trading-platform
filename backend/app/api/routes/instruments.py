from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import case, or_, select
from sqlalchemy.orm import Session

from backend.app.auth.user_auth import require_permission, require_user
from backend.app.db.session import get_db
from backend.app.models.instrument import Instrument
from workers.ingestion.instrument_registry import InstrumentRegistrySync

router = APIRouter(prefix="/api/v1", tags=["instruments"])


@router.get("/instruments")
def list_instruments(request: Request, search: str = Query(default="", max_length=80), quote_asset: str | None = Query(default=None, max_length=30), status: str = Query(default="TRADING", max_length=30), limit: int = Query(default=30, ge=1, le=100), offset: int = Query(default=0, ge=0, le=100000), db: Session = Depends(get_db)):
    user = require_user(request, db)
    require_permission(user, "market_memory.view")
    q = search.strip().upper()
    stmt = select(Instrument).where(
        Instrument.exchange == "binance",
        Instrument.provider == "binance",
        Instrument.is_listed.is_(True),
        Instrument.is_spot_trading_allowed.is_(True),
    )
    if status.upper() != "ALL":
        stmt = stmt.where(Instrument.exchange_status == status.upper())
    if quote_asset:
        stmt = stmt.where(Instrument.quote_asset == quote_asset.upper())
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(or_(Instrument.symbol.ilike(pattern), Instrument.base_asset.ilike(pattern), Instrument.quote_asset.ilike(pattern)))
        stmt = stmt.order_by(case((Instrument.symbol == q, 0), (Instrument.base_asset == q, 1), else_=2), Instrument.symbol)
    else:
        stmt = stmt.order_by(Instrument.quote_asset, Instrument.base_asset, Instrument.symbol)
    rows = db.execute(stmt.offset(offset).limit(limit)).scalars().all()
    return {"count": len(rows), "offset": offset, "limit": limit, "instruments": [{"symbol": row.symbol, "base_asset": row.base_asset, "quote_asset": row.quote_asset, "status": row.exchange_status or row.market_status, "spot_trading_allowed": row.is_spot_trading_allowed} for row in rows]}


@router.post("/instruments/sync")
def sync_instruments(request: Request, db: Session = Depends(get_db)):
    user = require_user(request, db)
    require_permission(user, "admin.manage")
    return InstrumentRegistrySync().sync()
