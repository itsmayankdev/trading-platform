ALTER TABLE instruments
    ADD COLUMN IF NOT EXISTS base_asset TEXT,
    ADD COLUMN IF NOT EXISTS quote_asset TEXT,
    ADD COLUMN IF NOT EXISTS market_type TEXT NOT NULL DEFAULT 'spot',
    ADD COLUMN IF NOT EXISTS exchange_status TEXT NOT NULL DEFAULT 'TRADING',
    ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_instruments_enabled
ON instruments (is_enabled);

CREATE INDEX IF NOT EXISTS idx_instruments_quote_status
ON instruments (quote_asset, exchange_status);
