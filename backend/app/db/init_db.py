from backend.app.db.session import Base, engine, SessionLocal
from backend.app.models.admin import AdminAuditLog, AdminPermission, AdminPlan, AdminRole, AdminUsageEvent, AdminUser, AdminUserModule
from backend.app.models.candle import Candle
from backend.app.models.instrument import Instrument
from backend.app.admin.seed import seed_control_plane
from sqlalchemy import inspect, text


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    # Lightweight forward migrations for existing development databases.
    inspector = inspect(engine)
    columns = {c["name"] for c in inspector.get_columns("admin_users")}
    with engine.begin() as conn:
        if "password_hash" not in columns:
            conn.execute(text("ALTER TABLE admin_users ADD COLUMN password_hash VARCHAR(512) NOT NULL DEFAULT ''"))
        if "first_name" not in columns:
            conn.execute(text("ALTER TABLE admin_users ADD COLUMN first_name VARCHAR(80) NOT NULL DEFAULT ''"))
        if "last_name" not in columns:
            conn.execute(text("ALTER TABLE admin_users ADD COLUMN last_name VARCHAR(80) NOT NULL DEFAULT ''"))
        if "first_name" not in columns or "last_name" not in columns:
            conn.execute(text("UPDATE admin_users SET first_name = split_part(trim(display_name), ' ', 1), last_name = CASE WHEN position(' ' in trim(display_name)) > 0 THEN trim(substr(trim(display_name), position(' ' in trim(display_name)) + 1)) ELSE '' END WHERE (first_name = '' OR last_name = '') AND display_name <> ''"))
    db = SessionLocal()
    try:
        seed_control_plane(db)
    finally:
        db.close()


if __name__ == "__main__":
    init_db()
