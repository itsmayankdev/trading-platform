import math

import numpy as np

from pattern_engine.normalization import (
    normalize_close_path,
)
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
            raise ValueError(
                "Pattern lengths must match"
            )

        current_path = normalize_close_path(
            current
        )

        historical_path = normalize_close_path(
            historical
        )

        distance = float(
            np.sqrt(
                np.mean(
                    (current_path - historical_path) ** 2
                )
            )
        )

        similarity = math.exp(
            -distance * 10.0
        )

        return max(
            0.0,
            min(1.0, similarity),
        )
