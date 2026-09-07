from datetime import datetime, timezone
import time

import httpx

from market_data.interface import Candle, MarketDataProvider


class BinanceProvider(MarketDataProvider):

    BASE_URL = "https://data-api.binance.vision"

    INTERVALS = {
        "1m",
        "3m",
        "5m",
        "15m",
        "30m",
        "1h",
        "2h",
        "4h",
        "6h",
        "8h",
        "12h",
        "1d",
        "3d",
        "1w",
        "1M",
    }

    MAX_LIMIT = 1000
    MAX_RETRIES = 4

    def get_candles(
        self,
        symbol: str,
        timeframe: str,
        start: datetime,
        end: datetime,
    ) -> list[Candle]:

        if timeframe not in self.INTERVALS:
            raise ValueError(
                f"Unsupported Binance timeframe: {timeframe}"
            )

        if start.tzinfo is None or end.tzinfo is None:
            raise ValueError(
                "start and end must be timezone-aware"
            )

        params = {
            "symbol": symbol.upper(),
            "interval": timeframe,
            "startTime": int(start.timestamp() * 1000),
            "endTime": int(end.timestamp() * 1000),
            "limit": self.MAX_LIMIT,
        }

        last_error = None

        for attempt in range(self.MAX_RETRIES):

            try:

                response = httpx.get(
                    f"{self.BASE_URL}/api/v3/klines",
                    params=params,
                    timeout=20.0,
                )

                response.raise_for_status()

                rows = response.json()

                candles = [
                    Candle(
                        timestamp=datetime.fromtimestamp(
                            row[0] / 1000,
                            tz=timezone.utc,
                        ),
                        open=float(row[1]),
                        high=float(row[2]),
                        low=float(row[3]),
                        close=float(row[4]),
                        volume=float(row[5]),
                    )
                    for row in rows
                ]

                return candles

            except (httpx.HTTPError, ValueError) as exc:

                last_error = exc

                if attempt == self.MAX_RETRIES - 1:
                    break

                delay = 2 ** attempt

                print(
                    f"Binance request failed "
                    f"(attempt {attempt + 1}/"
                    f"{self.MAX_RETRIES}). "
                    f"Retrying in {delay}s..."
                )

                time.sleep(delay)

        raise RuntimeError(
            f"Binance request failed after "
            f"{self.MAX_RETRIES} attempts"
        ) from last_error
