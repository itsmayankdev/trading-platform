import argparse
import time

from sqlalchemy import text

from backend.app.db.session import SessionLocal
from workers.ingestion.historical import HistoricalDownloader


class IngestionRunner:
    """Claim queued ingestion jobs safely and execute them one at a time."""

    def __init__(self, poll_seconds: int = 5) -> None:
        if poll_seconds < 1:
            raise ValueError("poll_seconds must be >= 1")
        self.poll_seconds = poll_seconds
        self.downloader = HistoricalDownloader()

    def claim_next(self) -> int | None:
        """Atomically claim one queued job using PostgreSQL row locking."""
        with SessionLocal() as db:
            row = db.execute(
                text(
                    """
                    SELECT id
                    FROM ingestion_jobs
                    WHERE status = 'queued'
                    ORDER BY updated_at ASC, id ASC
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                    """
                )
            ).first()

            if row is None:
                db.rollback()
                return None

            job_id = int(row[0])
            db.execute(
                text(
                    """
                    UPDATE ingestion_jobs
                    SET status = 'running', updated_at = NOW()
                    WHERE id = :job_id
                    """
                ),
                {"job_id": job_id},
            )
            db.commit()
            return job_id

    def run_once(self) -> int | None:
        job_id = self.claim_next()
        if job_id is None:
            return None

        print(f"Starting ingestion job {job_id}")
        try:
            inserted = self.downloader.run_job(job_id)
            print(f"Completed ingestion job {job_id}; inserted={inserted}")
        except Exception as exc:
            print(f"Ingestion job {job_id} failed: {exc}")
        return job_id

    def run_forever(self) -> None:
        print("Ingestion runner started.")
        while True:
            job_id = self.run_once()
            if job_id is None:
                time.sleep(self.poll_seconds)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run queued ingestion jobs")
    parser.add_argument("--once", action="store_true", help="Process at most one queued job")
    parser.add_argument("--poll-seconds", type=int, default=5)
    args = parser.parse_args()

    runner = IngestionRunner(poll_seconds=args.poll_seconds)
    if args.once:
        runner.run_once()
    else:
        runner.run_forever()


if __name__ == "__main__":
    main()
