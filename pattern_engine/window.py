from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class CandlePoint:
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass(frozen=True)
class PatternWindow:
    symbol: str
    timeframe: str
    start_time: datetime
    end_time: datetime
    candles: tuple[CandlePoint, ...]

    @property
    def length(self) -> int:
        return len(self.candles)
