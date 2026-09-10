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

    def rank(
        self,
        current: PatternWindow,
        historical_windows: list[PatternWindow],
        top_k: int = 10,
        min_separation_candles: int | None = None,
    ) -> list[RankedMatch]:
        candidates = [
            window
            for window in historical_windows
            if window.start_time != current.start_time
        ]

        if not candidates or top_k <= 0:
            return []

        scores = self.algorithm.score_many(
            current=current,
            historical_windows=candidates,
        )

        ranked_indices = sorted(
            range(len(candidates)),
            key=lambda index: float(scores[index]),
            reverse=True,
        )

        if min_separation_candles is None:
            min_separation_candles = current.length

        if len(historical_windows) >= 2:
            timestamps = sorted(window.start_time for window in historical_windows)
            spacing = timestamps[1] - timestamps[0]
            minimum_separation = spacing * min_separation_candles
        else:
            minimum_separation = None

        selected: list[RankedMatch] = []
        for index in ranked_indices:
            candidate = candidates[index]

            if minimum_separation is not None:
                too_close = any(
                    abs(candidate.start_time - selected_match.start_time) < minimum_separation
                    for selected_match in selected
                )
                if too_close:
                    continue

            selected.append(
                RankedMatch(
                    start_time=candidate.start_time,
                    end_time=candidate.end_time,
                    similarity_score=float(scores[index]),
                )
            )
            if len(selected) >= top_k:
                break

        return selected

    def rank_numerical_v1(
        self,
        current: PatternWindow,
        store: NumericalWindowStore,
        top_k: int = 10,
        min_separation_candles: int | None = None,
    ) -> list[RankedMatch]:
        """Rank directly from the compact numerical V1 representation."""
        if self.algorithm.version != "similarity_v1":
            raise ValueError("Numerical retrieval currently supports similarity_v1 only")
        if top_k <= 0:
            return []

        separation = min_separation_candles or current.length
        ranked = store.rank_v1(
            current_start_time=current.start_time,
            top_k=top_k,
            min_separation_candles=separation,
        )

        return [
            RankedMatch(
                start_time=store.timestamps[start_index],
                end_time=store.timestamps[start_index + store.window_length - 1],
                similarity_score=score,
            )
            for start_index, score in ranked
        ]

    def rank_numerical_v4(
        self,
        current: PatternWindow,
        store: NumericalWindowStore,
        top_k: int = 10,
        min_separation_candles: int | None = None,
    ) -> list[RankedMatch]:
        """Rank with strict V4 structural gates over the numerical store."""
        if self.algorithm.version != "similarity_v4":
            raise ValueError("Numerical retrieval currently supports similarity_v4 only")
        if top_k <= 0:
            return []

        separation = min_separation_candles or current.length
        ranked = store.rank_v4(
            current_start_time=current.start_time,
            top_k=top_k,
            min_separation_candles=separation,
        )

        return [
            RankedMatch(
                start_time=store.timestamps[start_index],
                end_time=store.timestamps[start_index + store.window_length - 1],
                similarity_score=score,
            )
            for start_index, score in ranked
        ]
