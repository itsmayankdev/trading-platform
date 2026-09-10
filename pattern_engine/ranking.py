from dataclasses import dataclass
from datetime import datetime

from pattern_engine.registry import get_algorithm
from pattern_engine.retrieval.numerical import NumericalWindowStore
from pattern_engine.window import PatternWindow


@dataclass(frozen=True)
class RankedMatch:
    start_time: datetime
    end_time: datetime
    similarity_score: float


class PatternRanker:
    def __init__(self, algorithm_version: str | None = None):
        self.algorithm = get_algorithm(algorithm_version)

    def rank(self, current: PatternWindow, historical_windows: list[PatternWindow], top_k: int = 10, min_separation_candles: int | None = None) -> list[RankedMatch]:
        candidates = [window for window in historical_windows if window.start_time != current.start_time]
        if not candidates or top_k <= 0:
            return []
        scores = self.algorithm.score_many(current=current, historical_windows=candidates)
        ranked_indices = sorted(range(len(candidates)), key=lambda index: float(scores[index]), reverse=True)
        if min_separation_candles is None:
            min_separation_candles = current.length
        minimum_separation = None
        if len(historical_windows) >= 2:
            timestamps = sorted(window.start_time for window in historical_windows)
            spacing = timestamps[1] - timestamps[0]
            minimum_separation = spacing * min_separation_candles
        selected = []
        for index in ranked_indices:
            candidate = candidates[index]
            if minimum_separation is not None and any(abs(candidate.start_time - selected_match.start_time) < minimum_separation for selected_match in selected):
                continue
            selected.append(RankedMatch(start_time=candidate.start_time, end_time=candidate.end_time, similarity_score=float(scores[index])))
            if len(selected) >= top_k:
                break
        return selected

    def rank_numerical_v1(self, current: PatternWindow, store: NumericalWindowStore, top_k: int = 10, min_separation_candles: int | None = None) -> list[RankedMatch]:
        """Compatibility entry point; the registry-selected numerical matcher is used."""
        if top_k <= 0:
            return []
        separation = min_separation_candles or current.length
        if self.algorithm.version == "similarity_v1":
            ranked = store.rank_v1(current.start_time, top_k, separation)
        elif self.algorithm.version == "similarity_v4":
            ranked = store.rank_v4(current.start_time, top_k, separation)
        elif self.algorithm.version == "similarity_v5":
            ranked = store.rank_v5(current.start_time, top_k, separation)
        else:
            raise ValueError(f"Numerical retrieval does not support {self.algorithm.version}")
        return [
            RankedMatch(start_time=store.timestamps[start_index], end_time=store.timestamps[start_index + store.window_length - 1], similarity_score=score)
            for start_index, score in ranked
        ]

    def rank_numerical_v4(self, current: PatternWindow, store: NumericalWindowStore, top_k: int = 10, min_separation_candles: int | None = None) -> list[RankedMatch]:
        if self.algorithm.version != "similarity_v4":
            raise ValueError("Numerical retrieval does not support similarity_v4")
        separation = min_separation_candles or current.length
        ranked = store.rank_v4(current.start_time, top_k, separation)
        return [RankedMatch(start_time=store.timestamps[i], end_time=store.timestamps[i + store.window_length - 1], similarity_score=score) for i, score in ranked]
