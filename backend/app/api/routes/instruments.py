from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from backend.app.auth.user_auth import require_permission, require_user
from backend.app.db.session import get_db
from backend.app.models.admin import AdminUsageEvent
from backend.app.models.candle import Candle
from backend.app.models.instrument import Instrument
from market_data.timeframes.utils import TIMEFRAME_MINUTES
from workers.ingestion.instrument_registry import InstrumentRegistrySync

router = APIRouter(prefix="/api/v1", tags=["instruments"])


@router.get("/instruments")
def list_instruments(
    request: Request,
    search: str = Query(default="", max_length=80),
    quote_asset: str | None = Query(default=None, max_length=30),
    status: str = Query(default="TRADING", max_length=30),
    symbols: str | None = Query(default=None, max_length=2000),
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=100000),
    db: Session = Depends(get_db),
):
    user = require_user(request, db)
    require_permission(user, "market_memory.view")
    q = search.strip().upper()
    requested_symbols = [item.strip().upper() for item in (symbols or "").split(",") if item.strip()]
    stmt = select(Instrument).where(
        Instrument.exchange == "binance",
        Instrument.provider == "binance",
        Instrument.is_listed.is_(True),
        Instrument.is_spot_trading_allowed.is_(True),
    )
    if requested_symbols:
        stmt = stmt.where(Instrument.symbol.in_(requested_symbols))
    if status.upper() != "ALL":
        stmt = stmt.where(Instrument.exchange_status == status.upper())
    if quote_asset:
        stmt = stmt.where(Instrument.quote_asset == quote_asset.upper())
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(or_(Instrument.symbol.ilike(pattern), Instrument.base_asset.ilike(pattern), Instrument.quote_asset.ilike(pattern)))
        stmt = stmt.order_by(
            case((Instrument.symbol == q, 0), (Instrument.base_asset == q, 1), else_=2),
            Instrument.symbol,
        )
    elif requested_symbols:
        stmt = stmt.order_by(case(*[(Instrument.symbol == symbol, index) for index, symbol in enumerate(requested_symbols)], else_=len(requested_symbols)))
    else:
        stmt = stmt.order_by(Instrument.quote_asset, Instrument.base_asset, Instrument.symbol)

    rows = db.execute(stmt.offset(offset).limit(limit)).scalars().all()
    if not rows:
        return {"count": 0, "offset": offset, "limit": limit, "instruments": []}

    ids = [row.id for row in rows]
    coverage_rows = db.execute(
        select(Candle.instrument_id, Candle.timeframe, func.count(Candle.timestamp), func.min(Candle.timestamp), func.max(Candle.timestamp))
        .where(Candle.instrument_id.in_(ids))
        .group_by(Candle.instrument_id, Candle.timeframe)
    ).all()

    now = datetime.now(timezone.utc)
    coverage: dict[int, dict[str, dict[str, object]]] = {}
    for instrument_id, timeframe, count, start_time, end_time in coverage_rows:
        minutes = TIMEFRAME_MINUTES.get(timeframe)
        if minutes is None:
            continue
        candle_count = int(count)
        depth_days = 0.0
        latest_age_minutes = None
        readiness = "partial"
        if start_time and end_time:
            depth_days = max(0.0, (end_time - start_time).total_seconds() / 86400.0)
            latest_age_minutes = max(0.0, (now - end_time).total_seconds() / 60.0)
            freshness_limit = max(15.0, minutes * 2.0)
            if candle_count >= 90 and latest_age_minutes <= freshness_limit:
                readiness = "ready"
        coverage.setdefault(instrument_id, {})[timeframe] = {
            "candle_count": candle_count,
            "start_time": start_time.isoformat() if start_time else None,
            "end_time": end_time.isoformat() if end_time else None,
            "depth_days": round(depth_days, 2),
            "latest_age_minutes": round(latest_age_minutes, 1) if latest_age_minutes is not None else None,
            "readiness": readiness,
        }

    return {
        "count": len(rows),
        "offset": offset,
        "limit": limit,
        "instruments": [
            {
                "symbol": row.symbol,
                "base_asset": row.base_asset,
                "quote_asset": row.quote_asset,
                "status": row.exchange_status or row.market_status,
                "spot_trading_allowed": row.is_spot_trading_allowed,
                "coverage": coverage.get(row.id, {}),
            }
            for row in rows
        ],
    }


@router.post("/instruments/usage")
def record_market_usage(
    request: Request,
    symbol: str = Query(..., min_length=1, max_length=50),
    db: Session = Depends(get_db),
):
    user = require_user(request, db)
    require_permission(user, "market_memory.view")
    normalized = symbol.strip().upper()
    instrument = db.execute(
        select(Instrument).where(
            Instrument.symbol == normalized,
            Instrument.exchange == "binance",
            Instrument.provider == "binance",
            Instrument.is_listed.is_(True),
            Instrument.is_spot_trading_allowed.is_(True),
        )
    ).scalar_one_or_none()
    if instrument is None:
        return {"recorded": False}

    db.add(AdminUsageEvent(
        user_id=user.id,
        event_type="market_selected",
        module="market_memory",
        path="/",
        metadata_json={"symbol": normalized},
    ))
    db.commit()
    return {"recorded": True, "symbol": normalized}


@router.post("/instruments/sync")
def sync_instruments(request: Request, db: Session = Depends(get_db)):
    user = require_user(request, db)
    require_permission(user, "admin.manage")
    return InstrumentRegistrySync().sync()
