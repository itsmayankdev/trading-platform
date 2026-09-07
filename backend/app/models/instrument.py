from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.db.session import Base


class Instrument(Base):
    __tablename__ = "instruments"

    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    asset_class: Mapped[str] = mapped_column(String(30))
    exchange: Mapped[str] = mapped_column(String(50))
    provider: Mapped[str] = mapped_column(String(50))
