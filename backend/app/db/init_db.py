from backend.app.db.session import Base, engine
from backend.app.models.candle import Candle
from backend.app.models.instrument import Instrument


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    init_db()
