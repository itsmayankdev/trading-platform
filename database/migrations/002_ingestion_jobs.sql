CREATE TABLE IF NOT EXISTS ingestion_jobs (
    id SERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    cursor_time TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL,
    candles_received INTEGER NOT NULL DEFAULT 0,
    candles_inserted INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_symbol_timeframe
ON ingestion_jobs (symbol, timeframe);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status
ON ingestion_jobs (status);
