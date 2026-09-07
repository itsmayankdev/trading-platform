import argparse

from market_data.instrument_policy import InstrumentPolicy
from market_data.providers.binance_instruments import BinanceInstrumentProvider


def discover_binance_instruments(policy: InstrumentPolicy | None = None) -> list:
    policy = policy or InstrumentPolicy()
    provider = BinanceInstrumentProvider()
    instruments = provider.get_instruments()
    return [instrument for instrument in instruments if policy.is_eligible(instrument)]


def main() -> None:
    parser = argparse.ArgumentParser(description="Discover Binance instruments eligible for ingestion")
    parser.add_argument("--quote", action="append", default=["USDT"], help="Allowed quote asset; repeatable")
    args = parser.parse_args()

    policy = InstrumentPolicy(quote_assets=frozenset(q.upper() for q in args.quote))
    all_instruments = BinanceInstrumentProvider().get_instruments()
    eligible = [item for item in all_instruments if policy.is_eligible(item)]

    print(f"Binance instruments discovered: {len(all_instruments)}")
    print(f"Eligible instruments: {len(eligible)}")
    print(f"Quote assets: {', '.join(sorted(policy.quote_assets))}")
    print("\nFirst 25 eligible symbols:")
    for item in eligible[:25]:
        print(f"  {item.symbol}")


if __name__ == "__main__":
    main()
