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

        # Pattern windows are built from consecutive candles. Use the first
        # two historical starts to infer the candle interval. This preserves
        # the existing cooldown semantics while avoiding overlapping matches.
        if len(historical_windows) >= 2:
            timestamps = sorted(
                window.start_time
                for window in historical_windows
            )
            spacing = timestamps[1] - timestamps[0]
            minimum_separation = spacing * min_separation_candles
        else:
            minimum_separation = None

        selected: list[RankedMatch] = []

        for index in ranked_indices:
            candidate = candidates[index]

            if minimum_separation is not None:
                too_close = any(
                    abs(candidate.start_time - selected_match.start_time)
                    < minimum_separation
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
