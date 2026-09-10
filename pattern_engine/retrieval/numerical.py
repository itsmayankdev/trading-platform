from __future__ import annotations

from datetime import datetime

import numpy as np

from pattern_engine.window import CandlePoint
from pattern_engine.algorithms.v4 import SimilarityV4
from pattern_engine.algorithms.v5 import SimilarityV5


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
    def from_columns(cls, timestamps: list[datetime], closes: list[float], window_length: int) -> "NumericalWindowStore":
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
        windows = np.lib.stride_tricks.sliding_window_view(self.close, self.window_length)
        return windows / windows[:, :1] - 1.0

    def window_start_times(self) -> np.ndarray:
        return self.timestamps[: self.window_count - 1]

    def window_end_times(self) -> np.ndarray:
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
        return starts[eligible], original_indices, eligible

    def _select_separated(self, starts, original_indices, scores, top_k, min_separation_candles):
        if len(starts) == 0 or top_k <= 0:
            return []
        ranked = np.argsort(-scores, kind="stable")
        minimum_separation = None
        if len(starts) >= 2:
            spacing = starts[1] - starts[0]
            minimum_separation = spacing * min_separation_candles
        selected = []
        selected_positions = []
        for rank_index in ranked:
            position = int(rank_index)
            candidate_start = starts[position]
            if minimum_separation is not None and any(abs(candidate_start - starts[p]) < minimum_separation for p in selected_positions):
                continue
            selected.append((int(original_indices[position]), float(scores[position])))
            selected_positions.append(position)
            if len(selected) >= top_k:
                break
        return selected

    def rank_v1(self, current_start_time: datetime, top_k: int, min_separation_candles: int):
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
        eligible_positions = np.flatnonzero(eligible)
        for chunk_start in range(0, len(eligible_positions), 25_000):
            positions = eligible_positions[chunk_start : chunk_start + 25_000]
            chunk = windows[positions]
            normalized = chunk / chunk[:, :1] - 1.0
            distances = np.sqrt(np.mean((normalized - current_path) ** 2, axis=1))
            scores[chunk_start : chunk_start + len(positions)] = np.exp(-distances * 10.0).clip(0.0, 1.0)
        return self._select_separated(starts, original_indices, scores, top_k, min_separation_candles)

    def rank_v4(self, current_start_time: datetime, top_k: int, min_separation_candles: int):
        if top_k <= 0:
            return []
        starts, original_indices, eligible = self._eligible_windows(current_start_time)
        if len(starts) == 0:
            return []
        windows = np.lib.stride_tricks.sliding_window_view(self.close, self.window_length)
        current_window = self.close[-self.window_length:]
        current_path = current_window / current_window[0] - 1.0
        scores = np.empty(len(starts), dtype=np.float64)
        eligible_positions = np.flatnonzero(eligible)
        for chunk_start in range(0, len(eligible_positions), 25_000):
            positions = eligible_positions[chunk_start : chunk_start + 25_000]
            chunk = windows[positions]
            normalized = chunk / chunk[:, :1] - 1.0
            scores[chunk_start : chunk_start + len(positions)] = SimilarityV4.score_paths(current_path, normalized)
        return self._select_separated(starts, original_indices, scores, top_k, min_separation_candles)

    def rank_v5(self, current_start_time: datetime, top_k: int, min_separation_candles: int):
        """Exact bounded-memory port of the supplied 100k reference matcher."""
        if top_k <= 0:
            return []
        starts, original_indices, eligible = self._eligible_windows(current_start_time)
        if len(starts) == 0:
            return []

        windows = np.lib.stride_tricks.sliding_window_view(self.close, self.window_length)
        current_window = self.close[-self.window_length:]
        current_path = SimilarityV5.normalize_array(current_window)
        scores = np.empty(len(starts), dtype=np.float64)
        eligible_positions = np.flatnonzero(eligible)

        # The supplied engine uses a rolling min/max deque. This vectorized
        # implementation computes the identical per-window min/max definition
        # in bounded chunks while preserving the same RMSE and score formula.
        for chunk_start in range(0, len(eligible_positions), 25_000):
            positions = eligible_positions[chunk_start : chunk_start + 25_000]
            chunk = windows[positions]
            minimum = np.min(chunk, axis=1, keepdims=True)
            maximum = np.max(chunk, axis=1, keepdims=True)
            normalized = (chunk - minimum) / np.where(maximum > minimum, maximum - minimum, 1.0)
            distances = np.sqrt(np.mean((normalized - current_path) ** 2, axis=1))
            scores[chunk_start : chunk_start + len(positions)] = SimilarityV5._distance_to_similarity_many(distances)

        return self._select_separated(starts, original_indices, scores, top_k, min_separation_candles)


def build_numerical_store(candles: list[CandlePoint], window_length: int) -> NumericalWindowStore:
    return NumericalWindowStore(candles, window_length)
