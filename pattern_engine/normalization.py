import numpy as np

from pattern_engine.window import PatternWindow


def normalize_close_path(
    window: PatternWindow,
) -> np.ndarray:

    closes = np.array(
        [c.close for c in window.candles],
        dtype=np.float64,
    )

    if len(closes) == 0:
        raise ValueError("Window contains no candles")

    base = closes[0]

    if base <= 0:
        raise ValueError("Invalid base price")

    return (closes / base) - 1.0


def normalized_returns(
    window: PatternWindow,
) -> np.ndarray:

    closes = np.array(
        [c.close for c in window.candles],
        dtype=np.float64,
    )

    if len(closes) < 2:
        raise ValueError(
            "At least two candles are required"
        )

    if np.any(closes <= 0):
        raise ValueError(
            "Prices must be positive"
        )

    return np.diff(closes) / closes[:-1]
