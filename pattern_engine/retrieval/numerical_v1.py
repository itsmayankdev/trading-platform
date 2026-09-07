from __future__ import annotations

import numpy as np

from pattern_engine.retrieval.interface import CandidateWindow, PatternRetriever
from pattern_engine.window import PatternWindow


class NumericalV1Retriever(PatternRetriever):
    """Exact V1 retrieval using a compact normalized close-path matrix."""

    def retrieve(self, current: PatternWindow, historical_windows: list[PatternWindow], top_k: int) -> list[CandidateWindow]:
        if top_k <= 0 or not historical_windows:
            return []

        candidates = [w for w in historical_windows if w.start_time != current.start_time]
        if not candidates:
            return []

        current_close = np.asarray([c.close for c in current.candles], dtype=np.float64)
        current_path = current_close / current_close[0] - 1.0
        matrix = np.asarray([
            np.asarray([c.close for c in w.candles], dtype=np.float64) / w.candles[0].close - 1.0
            for w in candidates
        ], dtype=np.float64)

        distances = np.sqrt(np.mean((matrix - current_path) ** 2, axis=1))
        scores = np.exp(-distances * 10.0).clip(0.0, 1.0)
        order = np.argsort(scores)[::-1][:top_k]
        return [CandidateWindow(candidates[int(i)], float(scores[int(i)])) for i in order]
