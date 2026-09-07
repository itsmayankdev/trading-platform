from dataclasses import asdict

import httpx

from market_data.instruments import InstrumentInfo


class BinanceInstrumentProvider:
    """Read public Binance spot exchange metadata."""

    BASE_URL = "https://data-api.binance.vision"

    def get_instruments(self) -> list[InstrumentInfo]:
        response = httpx.get(
            f"{self.BASE_URL}/api/v3/exchangeInfo",
            timeout=30.0,
        )
        response.raise_for_status()
        payload = response.json()

        result: list[InstrumentInfo] = []
        for item in payload.get("symbols", []):
            result.append(
                InstrumentInfo(
                    symbol=str(item["symbol"]).upper(),
                    base_asset=str(item["baseAsset"]).upper(),
                    quote_asset=str(item["quoteAsset"]).upper(),
                    market_type="spot",
                    status=str(item["status"]),
                    exchange="binance",
                    provider="binance",
                )
            )
        return result
