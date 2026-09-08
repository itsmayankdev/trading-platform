from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time

from fastapi import HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.app.core.config import get_settings
from backend.app.models.admin import AdminUser, AdminRole

COOKIE_NAME = "market_memory_user"
COOKIE_TTL_SECONDS = 7 * 24 * 60 * 60
PBKDF2_ITERATIONS = 310_000


def _secret() -> str:
    value = get_settings().admin_session_secret
    if not value:
        raise RuntimeError("ADMIN_SESSION_SECRET is not configured")
    return value


def hash_password(password: str) -> str:
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters")
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${base64.urlsafe_b64encode(salt).decode()}${base64.urlsafe_b64encode(digest).decode()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt_b64, digest_b64 = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.urlsafe_b64decode(salt_b64.encode())
        expected = base64.urlsafe_b64decode(digest_b64.encode())
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, int(iterations))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def _token(user: AdminUser) -> str:
    payload = {"sub": user.id, "version": user.access_version, "exp": int(time.time()) + COOKIE_TTL_SECONDS, "nonce": secrets.token_urlsafe(12)}
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    sig = hmac.new(_secret().encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def _read_token(token: str | None) -> tuple[int, int] | None:
    if not token or "." not in token:
        return None
    body, signature = token.rsplit(".", 1)
    if not hmac.compare_digest(signature, hmac.new(_secret().encode(), body.encode(), hashlib.sha256).hexdigest()):
        return None
    try:
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)).decode())
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
        return int(payload["sub"]), int(payload["version"])
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        return None


def set_user_cookie(response: Response, user: AdminUser) -> None:
    response.set_cookie(COOKIE_NAME, _token(user), max_age=COOKIE_TTL_SECONDS, httponly=True, secure=get_settings().app_env == "production", samesite="lax", path="/")


def clear_user_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


def get_current_user(request: Request, db: Session) -> AdminUser | None:
    try:
        parsed = _read_token(request.cookies.get(COOKIE_NAME))
    except RuntimeError:
        return None
    if not parsed:
        return None
    user_id, token_version = parsed
    user = db.scalar(select(AdminUser).options(selectinload(AdminUser.roles).selectinload(AdminRole.permissions), selectinload(AdminUser.permissions), selectinload(AdminUser.module_overrides), selectinload(AdminUser.plan)).where(AdminUser.id == user_id))
    if not user or user.status != "active" or user.access_version != token_version:
        return None
    return user


def require_user(request: Request, db: Session) -> AdminUser:
    user = get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def permission_codes(user: AdminUser) -> set[str]:
    return {p.code for role in user.roles for p in role.permissions} | {p.code for p in user.permissions}


def has_permission(user: AdminUser, code: str) -> bool:
    return code in permission_codes(user)


def require_permission(user: AdminUser, code: str) -> None:
    if not has_permission(user, code):
        raise HTTPException(status_code=403, detail=f"Permission denied: {code}")
