from __future__ import annotations

from datetime import datetime

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

    @classmethod
    def from_columns(
        cls,
        timestamps: list[datetime],
        closes: list[float],
        window_length: int,
    ) -> "NumericalWindowStore":
        """Build the numerical store directly from database columns."""
        if window_length <= 0:
            raise ValueError("window_length must be positive")
        if len(timestamps) != len(closes):
            raise ValueError("timestamps and closes must have the same length")
        if len(closes) < window_length:
            raise ValueError("Not enough candles for requested window length")

        store = cls.__new__(cls)
        store.timestamps = np.asarray(timestamps, dtype=object)
        store.close = np.asarray(closes, dtype=np.float64)
        store.window_length = window_length
        store.window_count = len(closes) - window_length + 1
        return store

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

    def rank_v1(
        self,
        current_start_time: datetime,
        top_k: int,
        min_separation_candles: int,
    ) -> list[tuple[int, float]]:
        """Return exact V1-ranked historical candle start indices and scores.

        Distance calculation is chunked so long histories do not allocate one
        giant normalized window matrix. Scores and ordering remain equivalent
        to the previous vectorized implementation.
        """
        if top_k <= 0:
            return []

        starts = self.window_start_times()
        ends = self.window_end_times()
        if len(starts) == 0:
            return []

        eligible = np.asarray(ends < current_start_time, dtype=bool)
        original_indices = np.flatnonzero(eligible)
        starts = starts[eligible]
        if len(starts) == 0:
            return []

        windows = np.lib.stride_tricks.sliding_window_view(self.close, self.window_length)
        current_window = self.close[-self.window_length:]
        current_path = current_window / current_window[0] - 1.0
        scores = np.empty(len(starts), dtype=np.float64)

        # Keep the temporary normalized matrix bounded even when a market has
        # years of 1m/5m candles. The final score array is only one float/window.
        chunk_size = 25_000
        eligible_positions = np.flatnonzero(eligible)
        for chunk_start in range(0, len(eligible_positions), chunk_size):
            positions = eligible_positions[chunk_start : chunk_start + chunk_size]
            chunk = windows[positions]
            normalized = chunk / chunk[:, :1] - 1.0
            distances = np.sqrt(np.mean((normalized - current_path) ** 2, axis=1))
            scores[chunk_start : chunk_start + len(positions)] = np.exp(-distances * 10.0).clip(0.0, 1.0)

        # Stable descending sort preserves the exact tie behavior of the old
        # full-matrix implementation while keeping peak memory bounded.
        ranked = np.argsort(-scores, kind="stable")

        minimum_separation = None
        if len(starts) >= 2:
            spacing = starts[1] - starts[0]
            minimum_separation = spacing * min_separation_candles

        selected: list[tuple[int, float]] = []
        selected_positions: list[int] = []

        for rank_index in ranked:
            position = int(rank_index)
            candidate_start = starts[position]

            if minimum_separation is not None and any(
                abs(candidate_start - starts[selected_position]) < minimum_separation
                for selected_position in selected_positions
            ):
                continue

            selected.append((int(original_indices[position]), float(scores[position])))
            selected_positions.append(position)
            if len(selected) >= top_k:
                break

        return selected


def build_numerical_store(
    candles: list[CandlePoint], window_length: int
) -> NumericalWindowStore:
    return NumericalWindowStore(candles, window_length)
