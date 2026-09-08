from __future__ import annotations
import base64, hashlib, hmac, json, secrets, time
from fastapi import HTTPException, Request, Response
from sqlalchemy.orm import Session
from backend.app.core.config import get_settings
from backend.app.models.admin import AdminAuditLog, AdminUser

COOKIE_NAME = "market_memory_admin"
COOKIE_TTL_SECONDS = 8 * 60 * 60

def _secret() -> str:
    value = get_settings().admin_session_secret
    if not value: raise RuntimeError("ADMIN_SESSION_SECRET is not configured")
    return value

def _make_token(email: str) -> str:
    payload = {"email": email.lower().strip(), "exp": int(time.time()) + COOKIE_TTL_SECONDS, "nonce": secrets.token_urlsafe(12)}
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    sig = hmac.new(_secret().encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"

def _read_token(token: str | None) -> str | None:
    if not token or "." not in token: return None
    body, signature = token.rsplit(".", 1)
    if not hmac.compare_digest(signature, hmac.new(_secret().encode(), body.encode(), hashlib.sha256).hexdigest()): return None
    try:
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)).decode())
        return str(payload["email"]).lower().strip() if int(payload.get("exp", 0)) >= int(time.time()) else None
    except (ValueError, KeyError, TypeError, json.JSONDecodeError): return None

def owner_email() -> str:
    email = get_settings().admin_email.strip().lower()
    if not email: raise RuntimeError("ADMIN_EMAIL is not configured")
    return email

def verify_owner_credentials(email: str, password: str) -> bool:
    configured_password = get_settings().admin_password
    if not configured_password: raise RuntimeError("ADMIN_PASSWORD is not configured")
    return hmac.compare_digest(email.strip().lower(), owner_email()) and hmac.compare_digest(password, configured_password)

def set_admin_cookie(response: Response, email: str) -> None:
    response.set_cookie(COOKIE_NAME, _make_token(email), max_age=COOKIE_TTL_SECONDS, httponly=True, secure=get_settings().app_env == "production", samesite="lax", path="/")

def clear_admin_cookie(response: Response) -> None: response.delete_cookie(COOKIE_NAME, path="/")

def require_admin(request: Request) -> str:
    try:
        email = _read_token(request.cookies.get(COOKIE_NAME))
        if email != owner_email(): raise HTTPException(status_code=401, detail="Admin authentication required")
        return email
    except RuntimeError as exc: raise HTTPException(status_code=503, detail=str(exc)) from exc

def audit(db: Session, actor_email: str, action: str, target_type: str = "", target_id: str = "", metadata: dict | None = None) -> None:
    db.add(AdminAuditLog(actor_email=actor_email, action=action, target_type=target_type, target_id=target_id, metadata_json=metadata or {}))

def permission_codes(user: AdminUser) -> set[str]:
    return {p.code for role in user.roles for p in role.permissions} | {p.code for p in user.permissions}

def user_access(user: AdminUser) -> dict:
    return {"permissions": sorted(permission_codes(user)), "modules": {m.module: m.enabled for m in user.module_overrides}, "access_version": user.access_version}
