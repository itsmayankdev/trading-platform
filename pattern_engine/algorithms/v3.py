from __future__ import annotations

import numpy as np

from pattern_engine.window import PatternWindow


class SimilarityV3:
    """Strict structural OHLCV matcher used by production pattern search."""

    version = "similarity_v3"
    feature_version = "ohlcv_structure_v2"

    WEIGHTS = {"close_path": 0.30, "returns": 0.20, "candle": 0.40, "volume": 0.10}
    SCALES = {"close_path": 0.08, "returns": 0.025, "candle": 0.08, "volume": 2.0}

    @staticmethod
    def _features(window: PatternWindow) -> dict[str, np.ndarray]:
        if window.length < 2:
            raise ValueError("At least two candles are required")

        opens = np.asarray([c.open for c in window.candles], dtype=np.float64)
        highs = np.asarray([c.high for c in window.candles], dtype=np.float64)
        lows = np.asarray([c.low for c in window.candles], dtype=np.float64)
        closes = np.asarray([c.close for c in window.candles], dtype=np.float64)
        volumes = np.asarray([c.volume for c in window.candles], dtype=np.float64)

        values = np.concatenate((opens, highs, lows, closes, volumes))
        if np.any(~np.isfinite(values)):
            raise ValueError("Window contains non-finite values")
        if np.any(opens <= 0) or np.any(highs <= 0) or np.any(lows <= 0) or np.any(closes <= 0):
            raise ValueError("Prices must be positive")
        if np.any(volumes < 0):
            raise ValueError("Volumes must be non-negative")
        if np.any(highs < np.maximum(opens, closes)) or np.any(lows > np.minimum(opens, closes)):
            raise ValueError("Invalid candle structure")

        close_path = closes / closes[0] - 1.0
        log_returns = np.diff(np.log(closes))

        body = (closes - opens) / closes
        upper_wick = (highs - np.maximum(opens, closes)) / closes
        lower_wick = (np.minimum(opens, closes) - lows) / closes
        total_range = (highs - lows) / closes
        close_location = (closes - lows) / np.maximum(highs - lows, closes * 1e-9)
        candle = np.column_stack((body, upper_wick, lower_wick, total_range, close_location)).reshape(-1)

        log_volume = np.log1p(volumes)
        median_volume = float(np.median(log_volume))
        mad = float(np.median(np.abs(log_volume - median_volume)))
        std = float(np.std(log_volume))
        scale = max(1.4826 * mad, std, 1e-6)
        volume = np.clip((log_volume - median_volume) / scale, -6.0, 6.0)

        return {"close_path": close_path, "returns": log_returns, "candle": candle, "volume": volume}

    @staticmethod
    def _rms(left: np.ndarray, right: np.ndarray) -> float:
        return float(np.sqrt(np.mean((left - right) ** 2)))

    def _component_similarities(self, current: PatternWindow, historical: PatternWindow) -> dict[str, float]:
        if current.length != historical.length:
            raise ValueError("Pattern lengths must match")
        current_features = self._features(current)
        historical_features = self._features(historical)
        return {
            name: float(np.exp(-self._rms(current_features[name], historical_features[name]) / self.SCALES[name]))
            for name in self.WEIGHTS
        }

    def score(self, current: PatternWindow, historical: PatternWindow) -> float:
        similarities = self._component_similarities(current, historical)
        weighted_log = sum(
            self.WEIGHTS[name] * np.log(max(similarities[name], 1e-12))
            for name in self.WEIGHTS
        )
        structural_cap = 0.45 + 0.55 * similarities["candle"]
        return float(np.clip(min(np.exp(weighted_log), structural_cap), 0.0, 1.0))

    def score_many(self, current: PatternWindow, historical_windows: list[PatternWindow]) -> np.ndarray:
        if not historical_windows:
            return np.empty(0, dtype=np.float64)
        if any(window.length != current.length for window in historical_windows):
            raise ValueError("Pattern lengths must match")
        return np.asarray([self.score(current, window) for window in historical_windows], dtype=np.float64)
