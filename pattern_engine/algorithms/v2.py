import numpy as np

from pattern_engine.features import PatternFeatures, extract_features
from pattern_engine.window import PatternWindow


class SimilarityV2:
    """Richer structural similarity using price, returns, candles and volume."""

    version = "similarity_v2"
    feature_version = "multi_feature_v1"

    # Weights are intentionally explicit and replaceable for later evaluation.
    WEIGHTS = {
        "close_path": 0.45,
        "returns": 0.25,
        "candle_structure": 0.20,
        "volume": 0.10,
    }

    def score(self, current: PatternWindow, historical: PatternWindow) -> float:
        self._validate_length(current, historical)
        current_features = extract_features(current)
        historical_features = extract_features(historical)
        distance = self._distance(current_features, historical_features)
        return self._distance_to_similarity(distance)

    def score_many(
        self,
        current: PatternWindow,
        historical_windows: list[PatternWindow],
    ) -> np.ndarray:
        if not historical_windows:
            return np.empty(0, dtype=np.float64)

        if any(window.length != current.length for window in historical_windows):
            raise ValueError("Pattern lengths must match")

        current_features = extract_features(current)
        historical_features = [extract_features(window) for window in historical_windows]

        distances = np.array(
            [self._distance(current_features, features) for features in historical_features],
            dtype=np.float64,
        )
        return np.exp(-distances * 10.0).clip(0.0, 1.0)

    @classmethod
    def _distance(cls, current: PatternFeatures, historical: PatternFeatures) -> float:
        close_distance = cls._rms(current.close_path, historical.close_path)
        return_distance = cls._rms(current.returns, historical.returns)
        candle_distance = cls._rms(current.candle_structure, historical.candle_structure)
        volume_distance = cls._rms(current.volume, historical.volume)

        return float(
            cls.WEIGHTS["close_path"] * close_distance
            + cls.WEIGHTS["returns"] * return_distance
            + cls.WEIGHTS["candle_structure"] * candle_distance
            + cls.WEIGHTS["volume"] * volume_distance
        )

    @staticmethod
    def _rms(left: np.ndarray, right: np.ndarray) -> float:
        if left.shape != right.shape:
            raise ValueError("Feature shapes must match")
        return float(np.sqrt(np.mean((left - right) ** 2)))

    @staticmethod
    def _validate_length(current: PatternWindow, historical: PatternWindow) -> None:
        if current.length != historical.length:
            raise ValueError("Pattern lengths must match")

    @staticmethod
    def _distance_to_similarity(distance: float) -> float:
        return float(np.clip(np.exp(-distance * 10.0), 0.0, 1.0))
