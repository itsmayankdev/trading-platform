from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.instrument import Instrument


class InstrumentRepository:

    def get_or_create(
        self,
        db: Session,
        symbol: str,
        asset_class: str,
        exchange: str,
        provider: str,
    ) -> Instrument:

        statement = select(Instrument).where(
            Instrument.symbol == symbol
        )

        instrument = db.execute(statement).scalar_one_or_none()

        if instrument:
            return instrument

        instrument = Instrument(
            symbol=symbol,
            asset_class=asset_class,
            exchange=exchange,
            provider=provider,
        )

        db.add(instrument)
        db.flush()

        return instrument

    def get_by_symbol(
        self,
        db: Session,
        symbol: str,
    ) -> Instrument | None:

        statement = select(Instrument).where(
            Instrument.symbol == symbol
        )

        return db.execute(statement).scalar_one_or_none()
