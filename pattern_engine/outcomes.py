from dataclasses import dataclass

from pattern_engine.window import CandlePoint, PatternWindow


@dataclass(frozen=True)
class Outcome:
    horizon_candles: int
    forward_return: float
    mfe: float
    mae: float


def calculate_outcomes(
    match: PatternWindow,
    future_candles: list[CandlePoint],
    horizons: tuple[int, ...] = (5, 15, 30, 60),
) -> list[Outcome]:

    if not match.candles:
        raise ValueError("Match contains no candles")

    entry_price = match.candles[-1].close

    if entry_price <= 0:
        raise ValueError("Invalid entry price")

    results = []

    for horizon in horizons:

        if len(future_candles) < horizon:
            continue

        future = future_candles[:horizon]

        final_close = future[-1].close

        forward_return = (
            final_close / entry_price
        ) - 1.0

        highest_high = max(
            candle.high
            for candle in future
        )

        lowest_low = min(
            candle.low
            for candle in future
        )

        mfe = (
            highest_high / entry_price
        ) - 1.0

        mae = (
            lowest_low / entry_price
        ) - 1.0

        results.append(
            Outcome(
                horizon_candles=horizon,
                forward_return=forward_return,
                mfe=mfe,
                mae=mae,
            )
        )

    return results
