from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Candle:
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


class MarketDataProvider(ABC):

    @abstractmethod
    def get_candles(
        self,
        symbol: str,
        timeframe: str,
        start: datetime,
        end: datetime,
    ) -> list[Candle]:
        raise NotImplementedError
