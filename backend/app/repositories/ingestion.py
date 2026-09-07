from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.ingestion import IngestionJob


class IngestionRepository:

    def create(
        self,
        db: Session,
        symbol: str,
        timeframe: str,
        start_time: datetime,
        end_time: datetime,
    ) -> IngestionJob:

        job = IngestionJob(
            symbol=symbol.upper(),
            timeframe=timeframe,
            start_time=start_time,
            end_time=end_time,
            cursor_time=start_time,
            status="running",
            candles_received=0,
            candles_inserted=0,
            updated_at=datetime.now(timezone.utc),
        )

        db.add(job)
        db.flush()

        return job

    def update(
        self,
        db: Session,
        job: IngestionJob,
        cursor_time: datetime,
        received: int,
        inserted: int,
    ) -> None:

        job.cursor_time = cursor_time
        job.candles_received += received
        job.candles_inserted += inserted
        job.updated_at = datetime.now(timezone.utc)

        db.flush()

    def complete(
        self,
        db: Session,
        job: IngestionJob,
    ) -> None:

        job.status = "completed"
        job.updated_at = datetime.now(timezone.utc)

        db.flush()

    def fail(
        self,
        db: Session,
        job: IngestionJob,
        error: str,
    ) -> None:

        job.status = "failed"
        job.last_error = error
        job.updated_at = datetime.now(timezone.utc)

        db.flush()

    def get(
        self,
        db: Session,
        job_id: int,
    ) -> IngestionJob | None:

        statement = select(IngestionJob).where(
            IngestionJob.id == job_id
        )

        return db.execute(statement).scalar_one_or_none()
