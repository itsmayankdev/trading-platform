from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.admin import AdminPermission, AdminPlan, AdminRole

MODULES = [
    ("market_memory", "Market Memory"),
    ("pattern_quality", "Pattern Quality"),
    ("scanner", "Market Scanner"),
    ("alerts", "Pattern Alerts"),
    ("replay", "Replay Lab"),
    ("evaluation", "Evaluation Lab"),
    ("validation", "Cross-Market Validation"),
    ("favorites", "Favorites"),
    ("admin", "Administration"),
]
OPERATIONS = ["view", "use", "create", "update", "delete", "manage"]


def seed_control_plane(db: Session) -> None:
    for code, label in MODULES:
        for operation in OPERATIONS:
            permission_code = f"{code}.{operation}"
            permission = db.scalar(select(AdminPermission).where(AdminPermission.code == permission_code))
            if not permission:
                db.add(AdminPermission(code=permission_code, module=code, operation=operation, description=f"{operation.title()} {label}"))
    db.flush()

    defaults = [
        ("owner", "Owner", "Full platform authority. Reserved for the configured owner.", True),
        ("administrator", "Administrator", "Operational administration without owner credential control.", True),
        ("analyst", "Analyst", "Research and analysis tools.", True),
        ("support", "Support", "Customer and workspace support access.", True),
        ("viewer", "Viewer", "Read-only access to explicitly enabled modules.", True),
    ]
    for code, name, description, system in defaults:
        role = db.scalar(select(AdminRole).where(AdminRole.code == code))
        if not role:
            role = AdminRole(code=code, name=name, description=description, system=system)
            db.add(role)
            db.flush()
        if code == "owner":
            role.permissions = list(db.scalars(select(AdminPermission)).all())
        elif code == "administrator":
            role.permissions = [p for p in db.scalars(select(AdminPermission)).all() if p.module != "admin" or p.operation in {"view", "use", "manage"}]
        elif code == "analyst":
            role.permissions = [p for p in db.scalars(select(AdminPermission)).all() if p.module in {"market_memory", "pattern_quality", "scanner", "alerts", "replay", "evaluation", "validation", "favorites"} and p.operation in {"view", "use", "create", "update"}]
        elif code == "support":
            role.permissions = [p for p in db.scalars(select(AdminPermission)).all() if p.module in {"market_memory", "pattern_quality", "scanner", "alerts", "favorites"} and p.operation in {"view", "use"}]
        elif code == "viewer":
            role.permissions = [p for p in db.scalars(select(AdminPermission)).all() if p.operation == "view" and p.module != "admin"]

    for code, name, description, price in [
        ("free", "Free", "Starter access", 0),
        ("pro", "Pro", "Full research access", 0),
        ("enterprise", "Enterprise", "Team and advanced access", 0),
    ]:
        if not db.scalar(select(AdminPlan).where(AdminPlan.code == code)):
            db.add(AdminPlan(code=code, name=name, description=description, price_cents=price, active=True))
    db.commit()
