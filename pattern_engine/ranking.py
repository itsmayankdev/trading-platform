from dataclasses import dataclass
from datetime import datetime

from pattern_engine.algorithms.v1 import SimilarityV1
from pattern_engine.window import PatternWindow


@dataclass(frozen=True)
class RankedMatch:
    start_time: datetime
    end_time: datetime
    similarity_score: float


class PatternRanker:

    def __init__(self):
        self.algorithm = SimilarityV1()

    def rank(
        self,
        current: PatternWindow,
        historical_windows: list[PatternWindow],
        top_k: int = 10,
        min_separation_candles: int | None = None,
    ) -> list[RankedMatch]:

        candidates = []

        for historical in historical_windows:

            if historical.start_time == current.start_time:
                continue

            score = self.algorithm.score(
                current=current,
                historical=historical,
            )

            candidates.append(
                RankedMatch(
                    start_time=historical.start_time,
                    end_time=historical.end_time,
                    similarity_score=score,
                )
            )

        candidates.sort(
            key=lambda item: item.similarity_score,
            reverse=True,
        )

        if min_separation_candles is None:
            min_separation_candles = current.length

        if len(historical_windows) >= 2:
            timestamps = sorted(
                window.start_time
                for window in historical_windows
            )

            spacing = (
                timestamps[1] - timestamps[0]
            )

            minimum_separation = (
                spacing * min_separation_candles
            )
        else:
            minimum_separation = None

        selected: list[RankedMatch] = []

        for candidate in candidates:

            if minimum_separation is not None:

                too_close = any(
                    abs(
                        candidate.start_time
                        - selected_match.start_time
                    ) < minimum_separation
                    for selected_match in selected
                )

                if too_close:
                    continue

            selected.append(candidate)

            if len(selected) >= top_k:
                break

        return selected
