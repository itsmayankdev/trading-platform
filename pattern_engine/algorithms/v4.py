from __future__ import annotations

import numpy as np

from pattern_engine.window import PatternWindow


class SimilarityV4:
    """Strict visual-shape matcher for production evaluation.

    Unlike V1, a high score cannot be produced from close-path RMSE alone.
    The matcher requires agreement in path shape, directional sequence and
    coarse turning-point structure. Candidates that fail any hard structural
    gate receive zero similarity.
    """

    version = "similarity_v4"
    feature_version = "strict_shape_v1"

    # Deliberately conservative thresholds. They are expressed in normalized
    # price-path units, so they work across instruments and price levels.
    MAX_RMSE = 0.020
    MIN_CORRELATION = 0.80
    MIN_DIRECTION_AGREEMENT = 0.70
    MAX_PATH_DEVIATION = 0.050

    def score(self, current: PatternWindow, historical: PatternWindow) -> float:
        if current.length != historical.length:
            raise ValueError("Pattern lengths must match")

        current_path = self._normalize(current)
        historical_path = self._normalize(historical)
        return float(self.score_paths(current_path, historical_path[None, :])[0])

    def score_many(
        self,
        current: PatternWindow,
        historical_windows: list[PatternWindow],
    ) -> np.ndarray:
        if not historical_windows:
            return np.empty(0, dtype=np.float64)
        if any(window.length != current.length for window in historical_windows):
            raise ValueError("Pattern lengths must match")

        current_path = self._normalize(current)
        historical_paths = np.asarray(
            [self._normalize(window) for window in historical_windows],
            dtype=np.float64,
        )
        return self.score_paths(current_path, historical_paths)

    @classmethod
    def score_paths(cls, current_path: np.ndarray, historical_paths: np.ndarray) -> np.ndarray:
        """Score normalized close paths using strict hard gates and bounded components."""
        if historical_paths.ndim != 2 or current_path.ndim != 1:
            raise ValueError("Expected one current path and a matrix of historical paths")
        if historical_paths.shape[1] != current_path.shape[0]:
            raise ValueError("Pattern lengths must match")
        if current_path.shape[0] < 3:
            raise ValueError("At least three candles are required")

        deltas = np.diff(current_path)
        historical_deltas = np.diff(historical_paths, axis=1)

        rmse = np.sqrt(np.mean((historical_paths - current_path) ** 2, axis=1))
        max_deviation = np.max(np.abs(historical_paths - current_path), axis=1)

        current_centered = current_path - np.mean(current_path)
        historical_centered = historical_paths - np.mean(historical_paths, axis=1, keepdims=True)
        denominator = np.linalg.norm(historical_centered, axis=1) * np.linalg.norm(current_centered)
        correlation = np.divide(
            historical_centered @ current_centered,
            denominator,
            out=np.zeros_like(rmse),
            where=denominator > 1e-12,
        )

        current_sign = np.sign(deltas)
        historical_sign = np.sign(historical_deltas)
        direction_agreement = np.mean(historical_sign == current_sign, axis=1)

        # Compare six evenly spaced anchors. This catches patterns with similar
        # overall drift but different intermediate peaks/troughs.
        anchor_indices = np.linspace(0, current_path.shape[0] - 1, 6, dtype=int)
        anchor_error = np.mean(
            np.abs(historical_paths[:, anchor_indices] - current_path[anchor_indices]),
            axis=1,
        )

        shape_score = np.clip(1.0 - rmse / cls.MAX_RMSE, 0.0, 1.0)
        correlation_score = np.clip(
            (correlation - cls.MIN_CORRELATION) / (1.0 - cls.MIN_CORRELATION),
            0.0,
            1.0,
        )
        direction_score = np.clip(
            (direction_agreement - cls.MIN_DIRECTION_AGREEMENT)
            / (1.0 - cls.MIN_DIRECTION_AGREEMENT),
            0.0,
            1.0,
        )
        anchor_score = np.clip(1.0 - anchor_error / cls.MAX_RMSE, 0.0, 1.0)

        # Geometric mean is intentionally unforgiving: one weak dimension
        # materially lowers the final score instead of being hidden by others.
        score = np.power(
            np.clip(
                shape_score * correlation_score * direction_score * anchor_score,
                0.0,
                1.0,
            ),
            0.25,
        )

        hard_gate = (
            (rmse <= cls.MAX_RMSE)
            & (max_deviation <= cls.MAX_PATH_DEVIATION)
            & (correlation >= cls.MIN_CORRELATION)
            & (direction_agreement >= cls.MIN_DIRECTION_AGREEMENT)
        )
        score = np.where(hard_gate, score, 0.0)

        # A near-perfect score must mean the individual structural checks are
        # genuinely strong; do not allow a single component to dominate.
        return np.clip(score, 0.0, 1.0)

    @staticmethod
    def _normalize(window: PatternWindow) -> np.ndarray:
        closes = np.asarray([c.close for c in window.candles], dtype=np.float64)
        if np.any(~np.isfinite(closes)) or np.any(closes <= 0):
            raise ValueError("Window contains invalid close prices")
        return closes / closes[0] - 1.0
