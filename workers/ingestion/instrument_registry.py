from datetime import datetime, timezone

from sqlalchemy import text

from backend.app.db.session import SessionLocal
from market_data.instrument_policy import InstrumentPolicy
from market_data.providers.binance_instruments import BinanceInstrumentProvider


class InstrumentRegistrySync:
    """Synchronize Binance's current spot universe into the local registry."""

    def __init__(self, policy: InstrumentPolicy | None = None):
        self.policy = policy or InstrumentPolicy()
        self.provider = BinanceInstrumentProvider()

    def sync(self) -> dict[str, int]:
        discovered = self.provider.get_instruments()
        now = datetime.now(timezone.utc)
        eligible = [item for item in discovered if self.policy.is_eligible(item)]

        with SessionLocal() as db:
            for item in discovered:
                enabled = self.policy.is_eligible(item)
                db.execute(
                    text(
                        """
                        INSERT INTO instruments
                            (symbol, asset_class, exchange, provider,
                             base_asset, quote_asset, market_type,
                             exchange_status, is_enabled, discovered_at, last_seen_at)
                        VALUES
                            (:symbol, 'crypto', 'binance', 'binance',
                             :base_asset, :quote_asset, :market_type,
                             :status, :enabled, :now, :now)
                        ON CONFLICT (symbol) DO UPDATE SET
                            base_asset = EXCLUDED.base_asset,
                            quote_asset = EXCLUDED.quote_asset,
                            market_type = EXCLUDED.market_type,
                            exchange_status = EXCLUDED.exchange_status,
                            is_enabled = EXCLUDED.is_enabled,
                            last_seen_at = EXCLUDED.last_seen_at
                        """
                    ),
                    {
                        "symbol": item.symbol,
                        "base_asset": item.base_asset,
                        "quote_asset": item.quote_asset,
                        "market_type": item.market_type,
                        "status": item.status,
                        "enabled": enabled,
                        "now": now,
                    },
                )

            # Anything no longer returned by the exchange is disabled rather
            # than deleted, preserving historical references and auditability.
            seen_symbols = [item.symbol for item in discovered]
            if seen_symbols:
                db.execute(
                    text(
                        "UPDATE instruments SET is_enabled = FALSE "
                        "WHERE exchange = 'binance' AND symbol <> ALL(:symbols)"
                    ),
                    {"symbols": seen_symbols},
                )
            db.commit()

        return {
            "discovered": len(discovered),
            "eligible": len(eligible),
            "disabled": len(discovered) - len(eligible),
        }


def main() -> None:
    result = InstrumentRegistrySync().sync()
    print(f"Discovered: {result['discovered']}")
    print(f"Eligible:   {result['eligible']}")
    print(f"Disabled:   {result['disabled']}")


if __name__ == "__main__":
    main()
