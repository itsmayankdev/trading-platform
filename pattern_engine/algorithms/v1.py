import math

import numpy as np

from pattern_engine.normalization import normalize_close_path
from pattern_engine.window import PatternWindow


class SimilarityV1:

    version = "similarity_v1"
    feature_version = "close_path_v1"

    def score(
        self,
        current: PatternWindow,
        historical: PatternWindow,
    ) -> float:

        if current.length != historical.length:
            raise ValueError("Pattern lengths must match")

        current_path = normalize_close_path(current)
        historical_path = normalize_close_path(historical)

        distance = float(
            np.sqrt(
                np.mean((current_path - historical_path) ** 2)
            )
        )

        return self._distance_to_similarity(distance)

    def score_many(
        self,
        current: PatternWindow,
        historical_windows: list[PatternWindow],
    ) -> np.ndarray:
        """Score many windows in one vectorized NumPy operation.

        This keeps the V1 scoring definition identical to ``score`` while
        avoiding one Python/NumPy allocation per historical candidate.
        """
        if not historical_windows:
            return np.empty(0, dtype=np.float64)

        length = current.length
        if any(window.length != length for window in historical_windows):
            raise ValueError("Pattern lengths must match")

        current_path = normalize_close_path(current)
        historical_paths = np.asarray(
            [normalize_close_path(window) for window in historical_windows],
            dtype=np.float64,
        )

        distances = np.sqrt(
            np.mean((historical_paths - current_path) ** 2, axis=1)
        )

        return np.exp(-distances * 10.0).clip(0.0, 1.0)

    @staticmethod
    def _distance_to_similarity(distance: float) -> float:
        return max(0.0, min(1.0, math.exp(-distance * 10.0)))
