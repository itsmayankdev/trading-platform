-- Remove duplicate active jobs deterministically, keeping the newest job.
WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY symbol, timeframe
            ORDER BY updated_at DESC, id DESC
        ) AS rn
    FROM ingestion_jobs
    WHERE status IN ('queued', 'running')
)
DELETE FROM ingestion_jobs
WHERE id IN (
    SELECT id
    FROM ranked
    WHERE rn > 1
);

-- Prevent duplicate work from being queued or running for the same market/timeframe.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ingestion_active_symbol_timeframe
ON ingestion_jobs (symbol, timeframe)
WHERE status IN ('queued', 'running');
