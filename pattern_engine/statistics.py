from dataclasses import dataclass
from statistics import mean, median

from pattern_engine.outcomes import Outcome


@dataclass(frozen=True)
class OutcomeStatistics:
    horizon_candles: int
    sample_size: int
    mean_return: float
    median_return: float
    win_rate: float
    mean_mfe: float
    mean_mae: float


def calculate_statistics(
    outcomes: list[Outcome],
) -> list[OutcomeStatistics]:

    by_horizon: dict[int, list[Outcome]] = {}

    for outcome in outcomes:
        by_horizon.setdefault(
            outcome.horizon_candles,
            [],
        ).append(outcome)

    results = []

    for horizon in sorted(by_horizon):

        group = by_horizon[horizon]

        returns = [
            item.forward_return
            for item in group
        ]

        mfe = [
            item.mfe
            for item in group
        ]

        mae = [
            item.mae
            for item in group
        ]

        wins = sum(
            1
            for value in returns
            if value > 0
        )

        results.append(
            OutcomeStatistics(
                horizon_candles=horizon,
                sample_size=len(group),
                mean_return=mean(returns),
                median_return=median(returns),
                win_rate=wins / len(group),
                mean_mfe=mean(mfe),
                mean_mae=mean(mae),
            )
        )

    return results
