from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class Binance24hTicker:
    symbol: str
    quote_volume: float


class BinanceTickerProvider:
    """Read public Binance 24h ticker statistics used for ingestion prioritization."""

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
                    )
                )
            except (KeyError, TypeError, ValueError):
                continue
        return result
