from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.db.session import Base


class IngestionJob(Base):
    __tablename__ = "ingestion_jobs"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    symbol: Mapped[str] = mapped_column(
        String(50),
        index=True,
    )

    timeframe: Mapped[str] = mapped_column(
        String(10),
        index=True,
    )

    start_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
    )

    end_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
    )

    cursor_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
    )

    status: Mapped[str] = mapped_column(
        String(20),
        index=True,
    )

    candles_received: Mapped[int] = mapped_column(
        Integer,
        default=0,
    )

    candles_inserted: Mapped[int] = mapped_column(
        Integer,
        default=0,
    )

    last_error: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
    )
