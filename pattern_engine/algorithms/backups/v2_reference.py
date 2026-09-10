from __future__ import annotations

import numpy as np

from pattern_engine.window import PatternWindow


class SimilarityV2Reference:
    """Permanent backup of the 2nd-update-HFDS supplied reference matcher.

    DO NOT USE AS THE ACTIVE REGISTRY IMPLEMENTATION.
    This file preserves the reference algorithm for future comparison or
    restoration. It is based on the supplied fast 100k candle engine.
    """

    version = "similarity_v2_reference"
    feature_version = "reference_minmax_close_v1"
    DIST_BASE = 1.4
    MIN_SIM = 0.80
    MAX_SIM = 0.995
    FOLLOW_BARS = 60

    def score(self, current: PatternWindow, historical: PatternWindow) -> float:
        if current.length != historical.length:
            raise ValueError("Pattern lengths must match")
        current_path = self._normalize(current)
        historical_path = self._normalize(historical)
        distance = float(np.sqrt(np.mean((historical_path - current_path) ** 2)))
        return self._distance_to_similarity(distance)

    def score_many(self, current: PatternWindow, historical_windows: list[PatternWindow]) -> np.ndarray:
        if not historical_windows:
            return np.empty(0, dtype=np.float64)
        if any(window.length != current.length for window in historical_windows):
            raise ValueError("Pattern lengths must match")
        current_path = self._normalize(current)
        historical_paths = np.asarray([self._normalize(window) for window in historical_windows], dtype=np.float64)
        distances = np.sqrt(np.mean((historical_paths - current_path) ** 2, axis=1))
        return self._distance_to_similarity_many(distances)

    @classmethod
    def _distance_to_similarity(cls, distance: float) -> float:
        if distance >= cls.DIST_BASE:
            return 0.0
        similarity = (cls.DIST_BASE - distance) / cls.DIST_BASE
        if similarity < cls.MIN_SIM:
            return 0.0
        return float(min(similarity, cls.MAX_SIM))

    @classmethod
    def _distance_to_similarity_many(cls, distances: np.ndarray) -> np.ndarray:
        similarities = ((cls.DIST_BASE - distances) / cls.DIST_BASE).clip(0.0, cls.MAX_SIM)
        return np.where(similarities >= cls.MIN_SIM, similarities, 0.0)

    @staticmethod
    def _normalize(window: PatternWindow) -> np.ndarray:
        closes = np.asarray([c.close for c in window.candles], dtype=np.float64)
        if np.any(~np.isfinite(closes)) or np.any(closes <= 0):
            raise ValueError("Window contains invalid close prices")
        minimum = float(np.min(closes))
        maximum = float(np.max(closes))
        rng = maximum - minimum or 1.0
        return (closes - minimum) / rng

    @staticmethod
    def normalize_array(closes: np.ndarray) -> np.ndarray:
        values = np.asarray(closes, dtype=np.float64)
        if values.ndim != 1 or values.size == 0:
            raise ValueError("Expected a non-empty one-dimensional close path")
        if np.any(~np.isfinite(values)) or np.any(values <= 0):
            raise ValueError("Window contains invalid closes")
        minimum = float(np.min(values))
        maximum = float(np.max(values))
        rng = maximum - minimum or 1.0
        return (values - minimum) / rng
