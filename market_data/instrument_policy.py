from dataclasses import dataclass

from market_data.instruments import InstrumentInfo


@dataclass(frozen=True)
class InstrumentPolicy:
    """Configurable rules for instruments eligible for historical ingestion."""

    quote_assets: frozenset[str] = frozenset({"USDT"})
    allowed_market_types: frozenset[str] = frozenset({"spot"})
    exclude_leveraged_tokens: bool = True

    def is_eligible(self, instrument: InstrumentInfo) -> bool:
        if not instrument.is_trading:
            return False
        if instrument.market_type not in self.allowed_market_types:
            return False
        if instrument.quote_asset not in self.quote_assets:
            return False
        if self.exclude_leveraged_tokens and self._looks_leveraged(instrument.base_asset):
            return False
        return True

    @staticmethod
    def _looks_leveraged(base_asset: str) -> bool:
        # Binance leveraged-token symbols commonly use UP/DOWN/BULL/BEAR suffixes.
        return base_asset.endswith(("UP", "DOWN", "BULL", "BEAR"))
