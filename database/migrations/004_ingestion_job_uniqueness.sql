-- Prevent duplicate work from being queued or running for the same market/timeframe.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ingestion_active_symbol_timeframe
ON ingestion_jobs (symbol, timeframe)
WHERE status IN ('queued', 'running');
