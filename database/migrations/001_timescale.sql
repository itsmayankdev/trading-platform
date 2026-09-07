CREATE EXTENSION IF NOT EXISTS timescaledb;

SELECT create_hypertable(
    'candles',
    'timestamp',
    if_not_exists => TRUE,
    migrate_data => TRUE
);

CREATE INDEX IF NOT EXISTS idx_candles_instrument_timeframe_timestamp
ON candles (instrument_id, timeframe, timestamp DESC);
