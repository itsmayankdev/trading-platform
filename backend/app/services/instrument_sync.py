from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.instrument import Instrument
from market_data.providers.binance_instruments import BinanceInstrumentProvider


class InstrumentSyncService:
    def __init__(self) -> None:
        self.provider = BinanceInstrumentProvider()

    def sync_binance_spot(self, db: Session) -> dict[str, int]:
        remote = self.provider.list_spot_instruments()
        remote_symbols = {item.symbol for item in remote}
        existing = db.execute(select(Instrument).where(Instrument.exchange == "binance", Instrument.provider == "binance")).scalars().all()
        by_symbol = {item.symbol: item for item in existing}
        created = updated = 0
        now = datetime.now(timezone.utc)
        for item in remote:
            instrument = by_symbol.get(item.symbol)
            if instrument is None:
                instrument = Instrument(symbol=item.symbol, asset_class="crypto", exchange="binance", provider="binance")
                db.add(instrument)
                created += 1
            else:
                updated += 1
            instrument.base_asset = item.base_asset
            instrument.quote_asset = item.quote_asset
            instrument.market_status = item.status
            instrument.is_spot_trading_allowed = item.is_spot_trading_allowed
            instrument.is_listed = True
        removed = 0
        for instrument in existing:
            if instrument.symbol not in remote_symbols and instrument.is_listed:
                instrument.is_listed = False
                instrument.market_status = "REMOVED"
                removed += 1
        db.commit()
        return {"remote": len(remote), "created": created, "updated": updated, "removed": removed, "synced_at": now.isoformat()}
