from backend.app.db.session import Base, engine, SessionLocal
from backend.app.models.admin import AdminAuditLog, AdminPermission, AdminPlan, AdminRole, AdminUsageEvent, AdminUser, AdminUserModule
from backend.app.models.candle import Candle
from backend.app.models.instrument import Instrument
from backend.app.admin.seed import seed_control_plane
from sqlalchemy import inspect, text


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    # Lightweight forward migration for existing development databases.
    inspector = inspect(engine)
    columns = {c["name"] for c in inspector.get_columns("admin_users")}
    if "password_hash" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE admin_users ADD COLUMN password_hash VARCHAR(512) NOT NULL DEFAULT ''"))
    db = SessionLocal()
    try:
        seed_control_plane(db)
    finally:
        db.close()


if __name__ == "__main__":
    init_db()
