from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from backend.app.auth.user_auth import clear_user_cookie, get_current_user, hash_password, require_user, set_user_cookie, verify_password
from backend.app.db.session import get_db
from backend.app.models.admin import AdminPlan, AdminRole, AdminUser
router=APIRouter(prefix="/api/v1/auth",tags=["auth"])
def _serialize(user:AdminUser)->dict:
    permissions={p.code for role in user.roles for p in role.permissions}|{p.code for p in user.permissions};modules={m.module:m.enabled for m in user.module_overrides}
    return {"id":user.id,"email":user.email,"display_name":user.display_name,"status":user.status,"plan":{"id":user.plan.id,"code":user.plan.code,"name":user.plan.name} if user.plan else None,"roles":[{"id":r.id,"code":r.code,"name":r.name} for r in user.roles],"permissions":sorted(permissions),"modules":modules,"access_version":user.access_version}
def _load_user(db:Session,user_id:int):
    return db.scalar(select(AdminUser).options(selectinload(AdminUser.roles).selectinload(AdminRole.permissions),selectinload(AdminUser.permissions),selectinload(AdminUser.module_overrides),selectinload(AdminUser.plan)).where(AdminUser.id==user_id))
@router.post("/register")
def register(body:dict=Body(...),response:Response=None,db:Session=Depends(get_db)):
    email=str(body.get("email","")).strip().lower();password=str(body.get("password",""));name=str(body.get("display_name","")).strip()
    if not email or "@" not in email:raise HTTPException(status_code=400,detail="Valid email is required")
    if db.scalar(select(AdminUser).where(AdminUser.email==email)):raise HTTPException(status_code=409,detail="An account with this email already exists")
    user=AdminUser(email=email,display_name=name,password_hash=hash_password(password),status="active");plan=db.scalar(select(AdminPlan).where(AdminPlan.code=="free",AdminPlan.active.is_(True)));role=db.scalar(select(AdminRole).where(AdminRole.code=="viewer"))
    if plan:user.plan=plan
    if role:user.roles=[role]
    db.add(user);db.flush();user.last_seen_at=datetime.now(timezone.utc);db.commit();user=_load_user(db,user.id);set_user_cookie(response,user);return _serialize(user)
@router.post("/login")
def login(body:dict=Body(...),response:Response=None,db:Session=Depends(get_db)):
    email=str(body.get("email","")).strip().lower();password=str(body.get("password",""));user=db.scalar(select(AdminUser).where(AdminUser.email==email))
    if not user or not user.password_hash or not verify_password(password,user.password_hash):raise HTTPException(status_code=401,detail="Invalid email or password")
    if user.status!="active":raise HTTPException(status_code=403,detail=f"Account is {user.status}")
    user.last_seen_at=datetime.now(timezone.utc);db.commit();user=_load_user(db,user.id);set_user_cookie(response,user);return _serialize(user)
@router.post("/logout")
def logout(response:Response):clear_user_cookie(response);return {"authenticated":False}
@router.get("/session")
def session(request:Request,db:Session=Depends(get_db)):
    user=get_current_user(request,db)
    if not user:return {"authenticated":False}
    user.last_seen_at=datetime.now(timezone.utc);db.commit();return {"authenticated":True,**_serialize(user)}
@router.get("/me")
def me(request:Request,db:Session=Depends(get_db)):return _serialize(require_user(request,db))
