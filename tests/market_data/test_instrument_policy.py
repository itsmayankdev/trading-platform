from market_data.instrument_policy import InstrumentPolicy
from market_data.instruments import InstrumentInfo


def instrument(symbol: str, base: str, quote: str = "USDT", status: str = "TRADING") -> InstrumentInfo:
    return InstrumentInfo(
        symbol=symbol,
        base_asset=base,
        quote_asset=quote,
        market_type="spot",
        status=status,
        exchange="binance",
        provider="binance",
    )


def test_accepts_trading_usdt_spot():
    assert InstrumentPolicy().is_eligible(instrument("BTCUSDT", "BTC"))


def test_rejects_non_usdt():
    assert not InstrumentPolicy().is_eligible(instrument("BTCEUR", "BTC", "EUR"))


def test_rejects_non_trading():
    assert not InstrumentPolicy().is_eligible(instrument("BTCUSDT", "BTC", status="BREAK"))


def test_rejects_leveraged_token_suffixes():
    policy = InstrumentPolicy()
    assert not policy.is_eligible(instrument("BTCUPUSDT", "BTCUP"))
    assert not policy.is_eligible(instrument("BTCDOWNUSDT", "BTCDOWN"))
