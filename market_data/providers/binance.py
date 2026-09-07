from datetime import datetime, timezone
import threading
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
    MAX_RETRIES = 5
    MIN_REQUEST_INTERVAL_SECONDS = 0.12
    _request_lock = threading.Lock()
    _last_request_at = 0.0

    @classmethod
    def _throttle(cls) -> None:
        with cls._request_lock:
            now = time.monotonic()
            wait = cls.MIN_REQUEST_INTERVAL_SECONDS - (now - cls._last_request_at)
            if wait > 0:
                time.sleep(wait)
            cls._last_request_at = time.monotonic()

    def get_candles(
        self,
        symbol: str,
        timeframe: str,
        start: datetime,
        end: datetime,
    ) -> list[Candle]:
        if timeframe not in self.INTERVALS:
            raise ValueError(f"Unsupported Binance timeframe: {timeframe}")
        if start.tzinfo is None or end.tzinfo is None:
            raise ValueError("start and end must be timezone-aware")
        if start >= end:
            raise ValueError("start must be before end")

        params = {
            "symbol": symbol.upper(),
            "interval": timeframe,
            "startTime": int(start.timestamp() * 1000),
            "endTime": int(end.timestamp() * 1000),
            "limit": self.MAX_LIMIT,
        }

        last_error: Exception | None = None

        for attempt in range(self.MAX_RETRIES):
            try:
                self._throttle()
                with httpx.Client(timeout=20.0) as client:
                    response = client.get(
                        f"{self.BASE_URL}/api/v3/klines",
                        params=params,
                    )

                if response.status_code == 429:
                    retry_after = response.headers.get("Retry-After")
                    delay = float(retry_after) if retry_after else min(2 ** attempt, 30)
                    raise _RetryableBinanceError(
                        f"Binance rate limit (429); retry after {delay:.1f}s",
                        delay,
                    )

                if 500 <= response.status_code < 600:
                    raise _RetryableBinanceError(
                        f"Binance server error ({response.status_code})",
                        min(2 ** attempt, 30),
                    )

                response.raise_for_status()
                rows = response.json()
                if not isinstance(rows, list):
                    raise ValueError("Unexpected Binance kline response")

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

            except _RetryableBinanceError as exc:
                last_error = exc
                if attempt == self.MAX_RETRIES - 1:
                    break
                delay = exc.delay
                print(
                    f"Binance request failed (attempt {attempt + 1}/"
                    f"{self.MAX_RETRIES}): {exc}. Retrying in {delay:.1f}s..."
                )
                time.sleep(delay)

            except (httpx.HTTPError, ValueError) as exc:
                last_error = exc
                if attempt == self.MAX_RETRIES - 1:
                    break
                delay = min(2 ** attempt, 30)
                print(
                    f"Binance request failed (attempt {attempt + 1}/"
                    f"{self.MAX_RETRIES}): {exc}. Retrying in {delay}s..."
                )
                time.sleep(delay)

        raise RuntimeError(
            f"Binance request failed after {self.MAX_RETRIES} attempts"
        ) from last_error


class _RetryableBinanceError(Exception):
    def __init__(self, message: str, delay: float) -> None:
        super().__init__(message)
        self.delay = delay
