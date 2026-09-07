import argparse
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from backend.app.db.session import SessionLocal
from workers.ingestion.historical import HistoricalDownloader


class IngestionRunner:
    """Claim queued ingestion jobs safely and execute them with bounded concurrency."""

    STALE_AFTER_MINUTES = 15

    def __init__(self, poll_seconds: int = 5) -> None:
        if poll_seconds < 1:
            raise ValueError("poll_seconds must be >= 1")
        self.poll_seconds = poll_seconds

    def recover_stale_jobs(self) -> int:
        """Return jobs left running by a crashed worker back to queued."""
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=self.STALE_AFTER_MINUTES)
        with SessionLocal() as db:
            result = db.execute(
                text(
                    """
                    UPDATE ingestion_jobs
                    SET status = 'queued',
                        last_error = COALESCE(last_error, 'Recovered after stale worker lease'),
                        updated_at = NOW()
                    WHERE status = 'running'
                      AND updated_at < :cutoff
                    """
                ),
                {"cutoff": cutoff},
            )
            db.commit()
            return result.rowcount

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

    def execute_job(self, job_id: int) -> None:
        downloader = HistoricalDownloader()
        print(f"Starting ingestion job {job_id}")
        try:
            inserted = downloader.run_job(job_id)
            print(f"Completed ingestion job {job_id}; inserted={inserted}")
        except Exception as exc:
            # run_job persists the failure state; keep the worker alive for other jobs.
            print(f"Ingestion job {job_id} failed: {exc}")

    def run_once(self) -> int | None:
        recovered = self.recover_stale_jobs()
        if recovered:
            print(f"Recovered stale jobs: {recovered}")

        job_id = self.claim_next()
        if job_id is None:
            return None

        self.execute_job(job_id)
        return job_id

    def worker_loop(self, worker_number: int) -> None:
        print(f"Worker {worker_number} started.")
        while True:
            job_id = self.claim_next()
            if job_id is None:
                time.sleep(self.poll_seconds)
                continue
            print(f"Worker {worker_number} claimed job {job_id}")
            self.execute_job(job_id)

    def run_forever(self, workers: int = 1) -> None:
        if workers < 1:
            raise ValueError("workers must be >= 1")

        print(f"Ingestion runner started with {workers} worker(s).")
        recovered = self.recover_stale_jobs()
        if recovered:
            print(f"Recovered stale jobs: {recovered}")

        if workers == 1:
            self.worker_loop(1)
            return

        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = [executor.submit(self.worker_loop, number) for number in range(1, workers + 1)]
            for future in futures:
                future.result()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run queued ingestion jobs")
    parser.add_argument("--once", action="store_true", help="Process at most one queued job")
    parser.add_argument("--workers", type=int, default=1, help="Bounded concurrent workers")
    parser.add_argument("--poll-seconds", type=int, default=5)
    args = parser.parse_args()

    runner = IngestionRunner(poll_seconds=args.poll_seconds)
    if args.once:
        if args.workers != 1:
            parser.error("--once only supports --workers 1")
        runner.run_once()
    else:
        runner.run_forever(workers=args.workers)


if __name__ == "__main__":
    main()
