from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class BinanceInstrument:
    symbol: str
    base_asset: str
    quote_asset: str
    status: str
    is_spot_trading_allowed: bool


class BinanceInstrumentProvider:
    BASE_URL = "https://data-api.binance.vision"

    def list_spot_instruments(self) -> list[BinanceInstrument]:
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
