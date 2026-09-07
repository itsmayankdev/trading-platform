import json
from dataclasses import dataclass
from pathlib import Path

from workers.ingestion.instrument_registry import InstrumentRegistrySync
from workers.ingestion.planner import IngestionPlan, IngestionPlanner
from market_data.providers.binance_tickers import BinanceTickerProvider


DEFAULT_POLICY_PATH = Path(__file__).resolve().parents[2] / "config" / "ingestion_policy.json"


@dataclass(frozen=True)
class Tier:
    name: str
    priority: int
    symbols: frozenset[str]
    top_by_quote_volume: int | None
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
                top_by_quote_volume=(
                    int(item["top_by_quote_volume"])
                    if item.get("top_by_quote_volume") is not None
                    else None
                ),
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

        ticker_map = {
            ticker.symbol: ticker.quote_volume
            for ticker in BinanceTickerProvider().get_24h_tickers()
        }
        eligible_symbols = self._eligible_symbols()

        plans: list[tuple[int, IngestionPlan]] = []
        assigned_symbols: set[str] = set()

        for tier in sorted(self.tiers, key=lambda item: item.priority):
            symbols = set(tier.symbols)
            if tier.top_by_quote_volume is not None:
                ranked = sorted(
                    (
                        (symbol, ticker_map.get(symbol, 0.0))
                        for symbol in eligible_symbols
                        if symbol not in assigned_symbols
                    ),
                    key=lambda item: item[1],
                    reverse=True,
                )
                symbols.update(symbol for symbol, _ in ranked[: tier.top_by_quote_volume])

            symbols &= eligible_symbols
            symbols -= assigned_symbols
            assigned_symbols.update(symbols)

            planner = IngestionPlanner(
                timeframes=self.timeframes,
                history_days=tier.history_days,
            )
            tier_plans = [
                plan for plan in planner.build_plans()
                if plan.symbol in symbols
            ]
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

    @staticmethod
    def _eligible_symbols() -> set[str]:
        from sqlalchemy import text
        from backend.app.db.session import SessionLocal

        with SessionLocal() as db:
            rows = db.execute(
                text(
                    """
                    SELECT symbol
                    FROM instruments
                    WHERE is_enabled = TRUE
                      AND exchange = 'binance'
                      AND provider = 'binance'
                    """
                )
            ).scalars().all()
        return {str(symbol).upper() for symbol in rows}


def main() -> None:
    result = IngestionScheduler().reconcile()
    for key, value in result.items():
        print(f"{key.capitalize()}: {value}")


if __name__ == "__main__":
    main()
