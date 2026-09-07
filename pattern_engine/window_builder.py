from pattern_engine.window import (
    CandlePoint,
    PatternWindow,
)


def build_windows(
    symbol: str,
    timeframe: str,
    candles: list[CandlePoint],
    window_length: int,
) -> list[PatternWindow]:

    if window_length <= 1:
        raise ValueError(
            "window_length must be greater than 1"
        )

    if len(candles) < window_length:
        return []

    windows = []

    for start in range(
        0,
        len(candles) - window_length + 1,
    ):

        chunk = candles[
            start:start + window_length
        ]

        windows.append(
            PatternWindow(
                symbol=symbol,
                timeframe=timeframe,
                start_time=chunk[0].timestamp,
                end_time=chunk[-1].timestamp,
                candles=tuple(chunk),
            )
        )

    return windows
