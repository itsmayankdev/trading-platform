from datetime import datetime, timedelta, timezone

from market_data.providers.binance import BinanceProvider


def main():
    provider = BinanceProvider()

    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=2)

    candles = provider.get_candles(
        symbol="ETHUSDT",
        timeframe="5m",
        start=start,
        end=end,
    )

    print(f"Received candles: {len(candles)}")

    if candles:
        print("First candle:")
        print(candles[0])

        print("\nLast candle:")
        print(candles[-1])


if __name__ == "__main__":
    main()
