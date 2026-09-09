import argparse
import json
import time
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
    top_by_usage: int | None
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
                top_by_usage=(
                    int(item["top_by_usage"])
                    if item.get("top_by_usage") is not None
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
        usage_rank = self._usage_rank()

        plans: list[tuple[int, float, int, IngestionPlan]] = []
        assigned_symbols: set[str] = set()

        for tier in sorted(self.tiers, key=lambda item: item.priority):
            symbols = set(tier.symbols)
            if tier.top_by_usage is not None:
                ranked_usage = sorted(
                    (
                        (symbol, usage_rank.get(symbol, 0))
                        for symbol in eligible_symbols
                        if symbol not in assigned_symbols and usage_rank.get(symbol, 0) > 0
                    ),
                    key=lambda item: (-item[1], item[0]),
                )
                symbols.update(symbol for symbol, _ in ranked_usage[: tier.top_by_usage])

            if tier.top_by_quote_volume is not None:
                ranked_volume = sorted(
                    (
                        (symbol, ticker_map.get(symbol, 0.0))
                        for symbol in eligible_symbols
                        if symbol not in assigned_symbols
                    ),
                    key=lambda item: item[1],
                    reverse=True,
                )
                symbols.update(symbol for symbol, _ in ranked_volume[: tier.top_by_quote_volume])

            symbols &= eligible_symbols
            symbols -= assigned_symbols
            assigned_symbols.update(symbols)

            planner = IngestionPlanner(
                timeframes=self.timeframes,
                history_days=tier.history_days,
            )
            tier_plans = [plan for plan in planner.build_plans() if plan.symbol in symbols]
            plans.extend(
                (tier.priority, ticker_map.get(plan.symbol, 0.0), usage_rank.get(plan.symbol, 0), plan)
                for plan in tier_plans
            )

        plans.sort(
            key=lambda item: (
                item[0],
                -item[2],
                -item[1],
                item[3].symbol,
                item[3].timeframe,
                item[3].reason,
            )
        )
        selected = [plan for _, _, _, plan in plans[: self.max_new_jobs]]
        queued = IngestionPlanner(timeframes=self.timeframes, history_days=1).enqueue(selected)

        return {
            "discovered": discovery["discovered"],
            "eligible": discovery["eligible"],
            "disabled": discovery["disabled"],
            "usage_markets": len(usage_rank),
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
                      AND is_listed = TRUE
                      AND is_spot_trading_allowed = TRUE
                      AND exchange_status = 'TRADING'
                      AND exchange = 'binance'
                      AND provider = 'binance'
                      AND quote_asset = 'USDT'
                    """
                )
            ).scalars().all()
        return {str(symbol).upper() for symbol in rows}

    @staticmethod
    def _usage_rank() -> dict[str, int]:
        from sqlalchemy import text
        from backend.app.db.session import SessionLocal

        with SessionLocal() as db:
            rows = db.execute(
                text(
                    """
                    SELECT upper(metadata_json ->> 'symbol') AS symbol, COUNT(*) AS uses
                    FROM admin_usage_events
                    WHERE event_type = 'market_selected'
                      AND created_at >= now() - interval '7 days'
                      AND metadata_json ->> 'symbol' IS NOT NULL
                    GROUP BY upper(metadata_json ->> 'symbol')
                    ORDER BY uses DESC, symbol
                    LIMIT 100
                    """
                )
            ).all()
        return {str(symbol): int(uses) for symbol, uses in rows if symbol}


def run_scheduler(interval_seconds: int, run_once: bool = False) -> None:
    if interval_seconds < 60:
        raise ValueError("interval_seconds must be >= 60")

    scheduler = IngestionScheduler()
    while True:
        started = time.monotonic()
        try:
            result = scheduler.reconcile()
            print(
                "Scheduler reconciliation: "
                + ", ".join(f"{key}={value}" for key, value in result.items()),
                flush=True,
            )
        except Exception as exc:
            print(f"Scheduler reconciliation failed: {exc}", flush=True)

        if run_once:
            return

        elapsed = time.monotonic() - started
        time.sleep(max(0.0, interval_seconds - elapsed))


def main() -> None:
    parser = argparse.ArgumentParser(description="Reconcile market instruments and ingestion jobs")
    parser.add_argument("--once", action="store_true", help="Run one reconciliation cycle and exit")
    parser.add_argument("--interval-seconds", type=int, default=300, help="Seconds between reconciliation cycles (minimum 60)")
    args = parser.parse_args()
    run_scheduler(interval_seconds=args.interval_seconds, run_once=args.once)


if __name__ == "__main__":
    main()
