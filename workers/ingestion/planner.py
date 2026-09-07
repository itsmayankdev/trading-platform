from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from backend.app.db.session import SessionLocal
from market_data.instrument_policy import InstrumentPolicy
from market_data.timeframes.utils import TIMEFRAME_MINUTES, floor_to_timeframe, timeframe_delta


@dataclass(frozen=True)
class IngestionPlan:
    symbol: str
    timeframe: str
    start: datetime
    end: datetime
    reason: str


class IngestionPlanner:
    """Create safe historical-ingestion plans from registry and candle coverage."""

    def __init__(
        self,
        timeframes: tuple[str, ...] = ("5m", "15m", "1h"),
        history_days: int = 365,
        policy: InstrumentPolicy | None = None,
    ) -> None:
        if history_days < 1:
            raise ValueError("history_days must be >= 1")
        for timeframe in timeframes:
            if timeframe not in TIMEFRAME_MINUTES:
                raise ValueError(f"Unsupported timeframe: {timeframe}")

        self.timeframes = timeframes
        self.history_days = history_days
        self.policy = policy or InstrumentPolicy()

    def build_plans(self, now: datetime | None = None) -> list[IngestionPlan]:
        now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
        plans: list[IngestionPlan] = []
        desired_end = now

        with SessionLocal() as db:
            rows = db.execute(
                text(
                    """
                    SELECT id, symbol
                    FROM instruments
                    WHERE is_enabled = TRUE
                      AND exchange = 'binance'
                      AND provider = 'binance'
                    ORDER BY symbol
                    """
                )
            ).mappings().all()

            for instrument in rows:
                symbol = instrument["symbol"]
                for timeframe in self.timeframes:
                    desired_start = floor_to_timeframe(
                        now - timedelta(days=self.history_days), timeframe
                    )
                    end = floor_to_timeframe(desired_end, timeframe)
                    delta = timeframe_delta(timeframe)

                    coverage = db.execute(
                        text(
                            """
                            SELECT MIN(timestamp) AS min_timestamp,
                                   MAX(timestamp) AS max_timestamp
                            FROM candles
                            WHERE instrument_id = :instrument_id
                              AND timeframe = :timeframe
                            """
                        ),
                        {"instrument_id": instrument["id"], "timeframe": timeframe},
                    ).mappings().one()

                    active = db.execute(
                        text(
                            """
                            SELECT 1
                            FROM ingestion_jobs
                            WHERE symbol = :symbol
                              AND timeframe = :timeframe
                              AND status = 'running'
                            LIMIT 1
                            """
                        ),
                        {"symbol": symbol, "timeframe": timeframe},
                    ).first()

                    if active:
                        continue

                    min_timestamp = coverage["min_timestamp"]
                    max_timestamp = coverage["max_timestamp"]

                    if min_timestamp is None:
                        plans.append(
                            IngestionPlan(symbol, timeframe, desired_start, end, "no_data")
                        )
                        continue

                    if min_timestamp > desired_start:
                        plans.append(
                            IngestionPlan(
                                symbol,
                                timeframe,
                                desired_start,
                                min_timestamp,
                                "historical_backfill",
                            )
                        )

                    if max_timestamp is None:
                        continue

                    next_start = floor_to_timeframe(max_timestamp + delta, timeframe)
                    if next_start < end:
                        plans.append(
                            IngestionPlan(
                                symbol,
                                timeframe,
                                next_start,
                                end,
                                "incremental",
                            )
                        )

        return plans

    def enqueue(self, plans: list[IngestionPlan]) -> int:
        """Persist plans as runnable jobs; never creates duplicate running jobs."""
        created = 0
        with SessionLocal() as db:
            for plan in plans:
                exists = db.execute(
                    text(
                        """
                        SELECT 1
                        FROM ingestion_jobs
                        WHERE symbol = :symbol
                          AND timeframe = :timeframe
                          AND status = 'running'
                        LIMIT 1
                        """
                    ),
                    {"symbol": plan.symbol, "timeframe": plan.timeframe},
                ).first()
                if exists:
                    continue

                db.execute(
                    text(
                        """
                        INSERT INTO ingestion_jobs
                            (symbol, timeframe, start_time, end_time,
                             cursor_time, status, candles_received,
                             candles_inserted, updated_at)
                        VALUES
                            (:symbol, :timeframe, :start_time, :end_time,
                             :start_time, 'queued', 0, 0, :updated_at)
                        """
                    ),
                    {
                        "symbol": plan.symbol,
                        "timeframe": plan.timeframe,
                        "start_time": plan.start,
                        "end_time": plan.end,
                        "updated_at": datetime.now(timezone.utc),
                    },
                )
                created += 1
            db.commit()
        return created


def main() -> None:
    planner = IngestionPlanner()
    plans = planner.build_plans()

    print(f"Plans generated: {len(plans)}")
    for plan in plans[:50]:
        print(
            f"  {plan.symbol:16} {plan.timeframe:4} "
            f"{plan.reason:20} {plan.start.isoformat()} -> {plan.end.isoformat()}"
        )
    if len(plans) > 50:
        print(f"  ... {len(plans) - 50} more")


if __name__ == "__main__":
    main()
