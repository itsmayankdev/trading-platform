from datetime import datetime

from sqlalchemy import BigInteger, Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.db.session import Base


class Candle(Base):
    __tablename__ = "candles"

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    instrument_id: Mapped[int] = mapped_column(
        ForeignKey("instruments.id"),
        index=True,
    )

    timeframe: Mapped[str] = mapped_column(
        String(10),
        index=True,
    )

    timestamp: Mapped[datetime] = mapped_column(
        primary_key=True,
        index=True,
    )

    open: Mapped[float] = mapped_column(Float)
    high: Mapped[float] = mapped_column(Float)
    low: Mapped[float] = mapped_column(Float)
    close: Mapped[float] = mapped_column(Float)
    volume: Mapped[float] = mapped_column(Float)

    __table_args__ = (
        UniqueConstraint(
            "instrument_id",
            "timeframe",
            "timestamp",
            name="uq_candle_instrument_timeframe_timestamp",
        ),
    )
