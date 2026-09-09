from datetime import datetime

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.db.session import Base


class Instrument(Base):
    __tablename__ = "instruments"

    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    asset_class: Mapped[str] = mapped_column(String(30))
    exchange: Mapped[str] = mapped_column(String(50))
    provider: Mapped[str] = mapped_column(String(50))
    base_asset: Mapped[str | None] = mapped_column(String(30), nullable=True, index=True)
    quote_asset: Mapped[str | None] = mapped_column(String(30), nullable=True, index=True)
    market_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    exchange_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    discovered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    market_status: Mapped[str] = mapped_column(String(30), default="TRADING", nullable=False, index=True)
    is_spot_trading_allowed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_listed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
