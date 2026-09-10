from __future__ import annotations

from datetime import datetime

import numpy as np

from pattern_engine.window import CandlePoint
from pattern_engine.algorithms.v4 import SimilarityV4


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

    def _eligible_windows(self, current_start_time: datetime):
        starts = self.window_start_times()
        ends = self.window_end_times()
        eligible = np.asarray(ends < current_start_time, dtype=bool)
        original_indices = np.flatnonzero(eligible)
        return starts[eligible], original_indices

    def _select_separated(
        self,
        starts: np.ndarray,
        original_indices: np.ndarray,
        scores: np.ndarray,
        top_k: int,
        min_separation_candles: int,
    ) -> list[tuple[int, float]]:
        if len(starts) == 0 or top_k <= 0:
            return []

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

    def rank_v1(
        self,
        current_start_time: datetime,
        top_k: int,
        min_separation_candles: int,
    ) -> list[tuple[int, float]]:
        """Return exact V1-ranked historical candle start indices and scores."""
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

        chunk_size = 25_000
        eligible_positions = np.flatnonzero(eligible)
        for chunk_start in range(0, len(eligible_positions), chunk_size):
            positions = eligible_positions[chunk_start : chunk_start + chunk_size]
            chunk = windows[positions]
            normalized = chunk / chunk[:, :1] - 1.0
            distances = np.sqrt(np.mean((normalized - current_path) ** 2, axis=1))
            scores[chunk_start : chunk_start + len(positions)] = np.exp(-distances * 10.0).clip(0.0, 1.0)

        return self._select_separated(
            starts, original_indices, scores, top_k, min_separation_candles
        )

    def rank_v4(
        self,
        current_start_time: datetime,
        top_k: int,
        min_separation_candles: int,
    ) -> list[tuple[int, float]]:
        """Rank with strict V4 shape gates using bounded-memory vectorization."""
        if top_k <= 0:
            return []

        starts, original_indices = self._eligible_windows(current_start_time)
        if len(starts) == 0:
            return []

        windows = np.lib.stride_tricks.sliding_window_view(self.close, self.window_length)
        current_window = self.close[-self.window_length:]
        current_path = current_window / current_window[0] - 1.0
        scores = np.empty(len(starts), dtype=np.float64)

        chunk_size = 25_000
        eligible_positions = np.flatnonzero(
            np.asarray(self.window_end_times() < current_start_time, dtype=bool)
        )
        for chunk_start in range(0, len(eligible_positions), chunk_size):
            positions = eligible_positions[chunk_start : chunk_start + chunk_size]
            normalized = windows[positions] / windows[positions, :, None][:, :, 0:1] if False else None
            # The expression above is intentionally avoided; normalize directly
            # from the first close of each candidate window.
            chunk = windows[positions]
            normalized = chunk / chunk[:, :1] - 1.0
            scores[chunk_start : chunk_start + len(positions)] = SimilarityV4.score_paths(
                current_path, normalized
            )

        return self._select_separated(
            starts, original_indices, scores, top_k, min_separation_candles
        )


def build_numerical_store(
    candles: list[CandlePoint], window_length: int
) -> NumericalWindowStore:
    return NumericalWindowStore(candles, window_length)
