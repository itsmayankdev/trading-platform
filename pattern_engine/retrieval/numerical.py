from __future__ import annotations

import numpy as np

from pattern_engine.window import CandlePoint


class NumericalWindowStore:
    """Compact numerical representation for high-throughput retrieval."""

    def __init__(self, candles: list[CandlePoint], window_length: int):
        if window_length <= 0:
            raise ValueError("window_length must be positive")
        if len(candles) < window_length:
            raise ValueError("Not enough candles for requested window length")

        self.timestamps = np.asarray([c.timestamp for c in candles], dtype=object)
        self.close = np.asarray([c.close for c in candles], dtype=np.float64)
        self.window_length = window_length
        self.window_count = len(candles) - window_length + 1

    def normalized_close_matrix(self) -> np.ndarray:
        windows = np.lib.stride_tricks.sliding_window_view(
            self.close, self.window_length
        )
        return windows / windows[:, :1] - 1.0

    def window_start_times(self) -> np.ndarray:
        """Return historical window starts, excluding the current window."""
        return self.timestamps[: self.window_count - 1]

    def window_end_times(self) -> np.ndarray:
        """Return historical window ends, excluding the current window."""
        return self.timestamps[self.window_length - 1 : -1]

    def current_normalized_path(self) -> np.ndarray:
        return self.normalized_close_matrix()[-1]

    def historical_normalized_matrix(self) -> np.ndarray:
        return self.normalized_close_matrix()[:-1]

    def current_start_time(self):
        return self.timestamps[-self.window_length]


def build_numerical_store(
    candles: list[CandlePoint], window_length: int
) -> NumericalWindowStore:
    return NumericalWindowStore(candles, window_length)
