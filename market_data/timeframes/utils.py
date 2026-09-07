from datetime import datetime, timedelta, timezone


TIMEFRAME_MINUTES = {
    "1m": 1,
    "3m": 3,
    "5m": 5,
    "15m": 15,
    "30m": 30,
    "1h": 60,
    "2h": 120,
    "4h": 240,
    "6h": 360,
    "8h": 480,
    "12h": 720,
    "1d": 1440,
}


def timeframe_delta(timeframe: str) -> timedelta:

    if timeframe not in TIMEFRAME_MINUTES:
        raise ValueError(
            f"Unsupported timeframe: {timeframe}"
        )

    return timedelta(
        minutes=TIMEFRAME_MINUTES[timeframe]
    )


def floor_to_timeframe(
    timestamp: datetime,
    timeframe: str,
) -> datetime:

    timestamp = timestamp.astimezone(timezone.utc)

    delta = timeframe_delta(timeframe)

    epoch = datetime(
        1970,
        1,
        1,
        tzinfo=timezone.utc,
    )

    elapsed = timestamp - epoch

    periods = elapsed // delta

    return epoch + periods * delta
