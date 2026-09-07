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

        This keeps retrieval entirely in the numerical representation. The
        returned indices refer directly to the original candle array, so the
        caller can materialize PatternWindow objects only for selected matches.
        """
        if top_k <= 0:
            return []

        matrix = self.historical_normalized_matrix()
        starts = self.window_start_times()
        ends = self.window_end_times()
        if len(matrix) == 0:
            return []

        eligible = np.asarray(ends < current_start_time, dtype=bool)
        matrix = matrix[eligible]
        eligible_start_indices = np.flatnonzero(eligible)
        starts = starts[eligible]

        if len(matrix) == 0:
            return []

        current_path = self.current_normalized_path()
        distances = np.sqrt(np.mean((matrix - current_path) ** 2, axis=1))
        scores = np.exp(-distances * 10.0).clip(0.0, 1.0)

        # Stable descending order preserves chronological candidate order for
        # equal scores, matching PatternRanker's stable Python sort.
        ranked = np.argsort(-scores, kind="stable")

        separation = None
        if len(starts) >= 2:
            spacing = starts[1] - starts[0]
            separation = spacing * min_separation_candles

        selected: list[tuple[int, float]] = []
        for rank_index in ranked:
            index = int(rank_index)
            start_index = int(eligible_start_indices[index])
            candidate_start = starts[index]

            if separation is not None and any(
                abs(candidate_start - starts[selected_index]) < separation
                for selected_index, _ in selected
            ):
                continue

            selected.append((start_index, float(scores[index])))
            if len(selected) >= top_k:
                break

        return selected


def build_numerical_store(
    candles: list[CandlePoint], window_length: int
) -> NumericalWindowStore:
    return NumericalWindowStore(candles, window_length)
