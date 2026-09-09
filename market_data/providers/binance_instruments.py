from dataclasses import dataclass

import httpx

from market_data.instruments import InstrumentInfo


@dataclass(frozen=True)
class BinanceInstrument:
    symbol: str
    base_asset: str
    quote_asset: str
    status: str
    is_spot_trading_allowed: bool

    @property
    def market_type(self) -> str:
        return "spot"

    @property
    def is_trading(self) -> bool:
        return self.status == "TRADING"


class BinanceInstrumentProvider:
    BASE_URL = "https://data-api.binance.vision"

    def _fetch(self) -> list[BinanceInstrument]:
        with httpx.Client(timeout=30.0) as client:
            response = client.get(f"{self.BASE_URL}/api/v3/exchangeInfo")
            response.raise_for_status()
            payload = response.json()
        symbols = payload.get("symbols")
        if not isinstance(symbols, list):
            raise RuntimeError("Unexpected Binance exchangeInfo response")
        result: list[BinanceInstrument] = []
        for item in symbols:
            if not isinstance(item, dict):
                continue
            symbol = str(item.get("symbol") or "").upper()
            base_asset = str(item.get("baseAsset") or "").upper()
            quote_asset = str(item.get("quoteAsset") or "").upper()
            status = str(item.get("status") or "UNKNOWN").upper()
            if not symbol or not base_asset or not quote_asset:
                continue
            result.append(BinanceInstrument(symbol, base_asset, quote_asset, status, bool(item.get("isSpotTradingAllowed", False))))
        return result

    def list_spot_instruments(self) -> list[BinanceInstrument]:
        return self._fetch()

    def get_instruments(self) -> list[InstrumentInfo]:
        return [
            InstrumentInfo(
                symbol=item.symbol,
                base_asset=item.base_asset,
                quote_asset=item.quote_asset,
                market_type=item.market_type,
                status=item.status,
                exchange="binance",
                provider="binance",
            )
            for item in self._fetch()
            if item.is_spot_trading_allowed
        ]
