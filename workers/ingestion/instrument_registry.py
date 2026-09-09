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
                             exchange_status, is_enabled, discovered_at, last_seen_at,
                             market_status, is_spot_trading_allowed, is_listed)
                        VALUES
                            (:symbol, 'crypto', 'binance', 'binance',
                             :base_asset, :quote_asset, :market_type,
                             :status, :enabled, :now, :now,
                             :status, TRUE, TRUE)
                        ON CONFLICT (symbol) DO UPDATE SET
                            base_asset = EXCLUDED.base_asset,
                            quote_asset = EXCLUDED.quote_asset,
                            market_type = EXCLUDED.market_type,
                            exchange_status = EXCLUDED.exchange_status,
                            is_enabled = EXCLUDED.is_enabled,
                            last_seen_at = EXCLUDED.last_seen_at,
                            market_status = EXCLUDED.market_status,
                            is_spot_trading_allowed = TRUE,
                            is_listed = TRUE
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

            db.execute(
                text(
                    """
                    UPDATE instruments
                    SET is_listed = FALSE,
                        market_status = 'REMOVED'
                    WHERE exchange = 'binance'
                      AND provider = 'binance'
                      AND last_seen_at < :now
                    """
                ),
                {"now": now},
            )
            # Re-assert current rows after the broad stale-row update above.
            if discovered:
                seen_symbols = [item.symbol for item in discovered]
                db.execute(
                    text(
                        "UPDATE instruments SET is_listed = TRUE "
                        "WHERE exchange = 'binance' AND symbol = ANY(:symbols)"
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
