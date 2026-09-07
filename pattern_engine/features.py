from dataclasses import dataclass

import numpy as np

from pattern_engine.window import PatternWindow


@dataclass(frozen=True)
class PatternFeatures:
    """Normalized feature blocks used by similarity algorithms."""

    close_path: np.ndarray
    returns: np.ndarray
    candle_structure: np.ndarray
    volume: np.ndarray

    @property
    def length(self) -> int:
        return len(self.close_path)


def extract_features(window: PatternWindow) -> PatternFeatures:
    """Extract scale-independent price, candle and volume features.

    All price features are normalized to make the representation comparable
    across instruments and price levels. Volume is represented as a robust
    relative series rather than an absolute quantity.
    """
    if window.length < 2:
        raise ValueError("At least two candles are required")

    opens = np.asarray([c.open for c in window.candles], dtype=np.float64)
    highs = np.asarray([c.high for c in window.candles], dtype=np.float64)
    lows = np.asarray([c.low for c in window.candles], dtype=np.float64)
    closes = np.asarray([c.close for c in window.candles], dtype=np.float64)
    volumes = np.asarray([c.volume for c in window.candles], dtype=np.float64)

    if np.any(~np.isfinite(np.concatenate((opens, highs, lows, closes, volumes)))):
        raise ValueError("Window contains non-finite values")
    if np.any(closes <= 0) or np.any(opens <= 0) or np.any(highs <= 0) or np.any(lows <= 0):
        raise ValueError("Prices must be positive")
    if np.any(volumes < 0):
        raise ValueError("Volumes must be non-negative")
    if np.any(highs < np.maximum(opens, closes)) or np.any(lows > np.minimum(opens, closes)):
        raise ValueError("Invalid candle structure")

    base = closes[0]
    close_path = closes / base - 1.0
    returns = np.diff(closes) / closes[:-1]

    candle_base = closes
    body = (closes - opens) / candle_base
    upper_wick = (highs - np.maximum(opens, closes)) / candle_base
    lower_wick = (np.minimum(opens, closes) - lows) / candle_base
    candle_structure = np.column_stack((body, upper_wick, lower_wick)).reshape(-1)

    log_volume = np.log1p(volumes)
    median_volume = float(np.median(log_volume))
    mad = float(np.median(np.abs(log_volume - median_volume)))
    scale = max(1.4826 * mad, 1e-9)
    volume = (log_volume - median_volume) / scale

    return PatternFeatures(
        close_path=close_path,
        returns=returns,
        candle_structure=candle_structure,
        volume=volume,
    )
