from dataclasses import dataclass


@dataclass(frozen=True)
class InstrumentInfo:
    """Normalized exchange instrument metadata."""

    symbol: str
    base_asset: str
    quote_asset: str
    market_type: str
    status: str
    exchange: str
    provider: str

    @property
    def is_trading(self) -> bool:
        return self.status == "TRADING"
