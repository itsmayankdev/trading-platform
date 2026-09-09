from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class Binance24hTicker:
    symbol: str
    quote_volume: float
    last_price: float
    price_change_percent: float


class BinanceTickerProvider:
    """Read public Binance 24h ticker statistics."""

    BASE_URL = "https://data-api.binance.vision"

    def get_24h_tickers(self) -> list[Binance24hTicker]:
        response = httpx.get(
            f"{self.BASE_URL}/api/v3/ticker/24hr",
            timeout=30.0,
        )
        response.raise_for_status()
        payload = response.json()

        result: list[Binance24hTicker] = []
        for item in payload if isinstance(payload, list) else []:
            try:
                result.append(
                    Binance24hTicker(
                        symbol=str(item["symbol"]).upper(),
                        quote_volume=float(item["quoteVolume"]),
                        last_price=float(item["lastPrice"]),
                        price_change_percent=float(item["priceChangePercent"]),
                    )
                )
            except (KeyError, TypeError, ValueError):
                continue
        return result

    def get_24h_ticker(self, symbol: str) -> Binance24hTicker:
        normalized = symbol.strip().upper()
        if not normalized:
            raise ValueError("symbol is required")
        response = httpx.get(
            f"{self.BASE_URL}/api/v3/ticker/24hr",
            params={"symbol": normalized},
            timeout=10.0,
        )
        response.raise_for_status()
        item = response.json()
        if not isinstance(item, dict):
            raise RuntimeError("Unexpected Binance ticker response")
        try:
            return Binance24hTicker(
                symbol=str(item["symbol"]).upper(),
                quote_volume=float(item["quoteVolume"]),
                last_price=float(item["lastPrice"]),
                price_change_percent=float(item["priceChangePercent"]),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise RuntimeError("Invalid Binance ticker response") from exc
