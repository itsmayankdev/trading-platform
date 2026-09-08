from backend.app.db.session import Base, engine, SessionLocal
from backend.app.models.admin import AdminAuditLog, AdminPermission, AdminPlan, AdminRole, AdminUsageEvent, AdminUser, AdminUserModule
from backend.app.models.candle import Candle
from backend.app.models.instrument import Instrument
from backend.app.admin.seed import seed_control_plane


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_control_plane(db)
    finally:
        db.close()


if __name__ == "__main__":
    init_db()
