import json
from dataclasses import dataclass
from pathlib import Path

from workers.ingestion.instrument_registry import InstrumentRegistrySync
from workers.ingestion.planner import IngestionPlan, IngestionPlanner


DEFAULT_POLICY_PATH = Path(__file__).resolve().parents[2] / "config" / "ingestion_policy.json"


@dataclass(frozen=True)
class Tier:
    name: str
    priority: int
    symbols: frozenset[str]
    history_days: int


class IngestionScheduler:
    """Reconcile the exchange universe and enqueue a bounded, prioritized workload."""

    def __init__(self, policy_path: Path = DEFAULT_POLICY_PATH) -> None:
        config = json.loads(policy_path.read_text(encoding="utf-8"))
        self.timeframes = tuple(config.get("timeframes", ("5m", "15m", "1h")))
        self.max_new_jobs = int(config.get("max_new_jobs_per_run", 30))
        self.tiers = tuple(
            Tier(
                name=item["name"],
                priority=int(item["priority"]),
                symbols=frozenset(symbol.upper() for symbol in item.get("symbols", [])),
                history_days=int(item["history_days"]),
            )
            for item in config.get("tiers", [])
        )
        if not self.tiers:
            raise ValueError("ingestion policy must define at least one tier")
        if self.max_new_jobs < 1:
            raise ValueError("max_new_jobs_per_run must be >= 1")

    def reconcile(self) -> dict[str, int]:
        registry = InstrumentRegistrySync()
        discovery = registry.sync()

        plans: list[tuple[int, IngestionPlan]] = []
        for tier in sorted(self.tiers, key=lambda item: item.priority):
            planner = IngestionPlanner(
                timeframes=self.timeframes,
                history_days=tier.history_days,
            )
            tier_plans = planner.build_plans()

            if tier.symbols:
                tier_plans = [plan for plan in tier_plans if plan.symbol in tier.symbols]

            plans.extend((tier.priority, plan) for plan in tier_plans)

        plans.sort(key=lambda item: (item[0], item[1].symbol, item[1].timeframe, item[1].reason))
        selected = [plan for _, plan in plans[: self.max_new_jobs]]
        queued = IngestionPlanner(timeframes=self.timeframes, history_days=1).enqueue(selected)

        return {
            "discovered": discovery["discovered"],
            "eligible": discovery["eligible"],
            "disabled": discovery["disabled"],
            "plans": len(plans),
            "selected": len(selected),
            "queued": queued,
        }


def main() -> None:
    result = IngestionScheduler().reconcile()
    for key, value in result.items():
        print(f"{key.capitalize()}: {value}")


if __name__ == "__main__":
    main()
