from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Table, Column
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.app.db.session import Base

def utcnow() -> datetime: return datetime.now(timezone.utc)

user_roles = Table("admin_user_roles", Base.metadata, Column("user_id", ForeignKey("admin_users.id", ondelete="CASCADE"), primary_key=True), Column("role_id", ForeignKey("admin_roles.id", ondelete="CASCADE"), primary_key=True))
role_permissions = Table("admin_role_permissions", Base.metadata, Column("role_id", ForeignKey("admin_roles.id", ondelete="CASCADE"), primary_key=True), Column("permission_id", ForeignKey("admin_permissions.id", ondelete="CASCADE"), primary_key=True))
user_permissions = Table("admin_user_permissions", Base.metadata, Column("user_id", ForeignKey("admin_users.id", ondelete="CASCADE"), primary_key=True), Column("permission_id", ForeignKey("admin_permissions.id", ondelete="CASCADE"), primary_key=True))

class AdminPlan(Base):
    __tablename__ = "admin_plans"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(500), default="")
    price_cents: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class AdminUser(Base):
    __tablename__ = "admin_users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(160), default="")
    first_name: Mapped[str] = mapped_column(String(80), default="")
    last_name: Mapped[str] = mapped_column(String(80), default="")
    password_hash: Mapped[str] = mapped_column(String(512), default="")
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)
    plan_id: Mapped[int | None] = mapped_column(ForeignKey("admin_plans.id", ondelete="SET NULL"), nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    access_version: Mapped[int] = mapped_column(Integer, default=1)
    plan: Mapped[AdminPlan | None] = relationship()
    roles: Mapped[list[AdminRole]] = relationship(secondary=user_roles, back_populates="users")
    permissions: Mapped[list[AdminPermission]] = relationship(secondary=user_permissions)
    module_overrides: Mapped[list[AdminUserModule]] = relationship(back_populates="user", cascade="all, delete-orphan")

class AdminRole(Base):
    __tablename__ = "admin_roles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(500), default="")
    system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    users: Mapped[list[AdminUser]] = relationship(secondary=user_roles, back_populates="roles")
    permissions: Mapped[list[AdminPermission]] = relationship(secondary=role_permissions, back_populates="roles")

class AdminPermission(Base):
    __tablename__ = "admin_permissions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    module: Mapped[str] = mapped_column(String(80), index=True)
    operation: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(300), default="")
    roles: Mapped[list[AdminRole]] = relationship(secondary=role_permissions, back_populates="roles")

class AdminUserModule(Base):
    __tablename__ = "admin_user_modules"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("admin_users.id", ondelete="CASCADE"), index=True)
    module: Mapped[str] = mapped_column(String(80), index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    user: Mapped[AdminUser] = relationship(back_populates="module_overrides")

class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_email: Mapped[str] = mapped_column(String(320), index=True)
    action: Mapped[str] = mapped_column(String(120), index=True)
    target_type: Mapped[str] = mapped_column(String(80), default="")
    target_id: Mapped[str] = mapped_column(String(120), default="")
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

class AdminUsageEvent(Base):
    __tablename__ = "admin_usage_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(80), index=True)
    module: Mapped[str] = mapped_column(String(80), index=True)
    path: Mapped[str] = mapped_column(String(300), default="")
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
