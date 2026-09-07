from __future__ import annotations

import numpy as np

from pattern_engine.registry import get_algorithm
from pattern_engine.retrieval.interface import CandidateWindow, PatternRetriever
from pattern_engine.window import PatternWindow


class BruteForceRetriever(PatternRetriever):
    """Reference retriever that scores every historical candidate."""

    def __init__(self, algorithm_version: str | None = None):
        self.algorithm = get_algorithm(algorithm_version)

    def retrieve(self, current, historical_windows, top_k):
        if top_k <= 0 or not historical_windows:
            return []

        candidates = [
            window for window in historical_windows
            if window.start_time != current.start_time
        ]
        if not candidates:
            return []

        scores = self.algorithm.score_many(current, candidates)
        order = np.argsort(scores)[::-1]
        return [
            CandidateWindow(candidates[int(index)], float(scores[int(index)]))
            for index in order[:top_k]
        ]
