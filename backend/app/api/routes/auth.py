from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload
from backend.app.auth.user_auth import clear_user_cookie, get_current_user, hash_password, require_user, set_user_cookie, verify_password
from backend.app.db.session import get_db
from backend.app.models.admin import AdminPlan, AdminRole, AdminUser
from backend.app.services.plan_service import activate_registration_plan, effective_limits, effective_plan, search_usage
router=APIRouter(prefix="/api/v1/auth",tags=["auth"])

def _load_user(db:Session,user_id:int):
    return db.scalar(select(AdminUser).options(selectinload(AdminUser.roles).selectinload(AdminRole.permissions),selectinload(AdminUser.permissions),selectinload(AdminUser.module_overrides),selectinload(AdminUser.plan),selectinload(AdminUser.trial_plan)).where(AdminUser.id==user_id))

def _serialize(user:AdminUser,db:Session)->dict:
    plan=effective_plan(db,user);permissions={p.code for role in user.roles for p in role.permissions}|{p.code for p in user.permissions};modules={m.module:m.enabled for m in user.module_overrides};used=search_usage(db,user.id);limits=effective_limits(user,plan)
    return {"id":user.id,"email":user.email,"display_name":user.display_name,"first_name":user.first_name,"last_name":user.last_name,"status":user.status,"plan":{"id":plan.id,"code":plan.code,"name":plan.name,"description":plan.description,"price_cents":plan.price_cents,"trial_days":plan.trial_days,"features":plan.features_json or [],"limits":limits},"plan_status":user.plan_status,"trial_ends_at":user.trial_ends_at.isoformat() if user.trial_ends_at else None,"subscription_started_at":user.subscription_started_at.isoformat() if user.subscription_started_at else None,"subscription_ends_at":user.subscription_ends_at.isoformat() if user.subscription_ends_at else None,"usage":{"searches_today":used,"search_limit":limits.get("searches_per_day")},"roles":[{"id":r.id,"code":r.code,"name":r.name} for r in user.roles],"permissions":sorted(permissions),"modules":modules,"access_version":user.access_version,"created_at":user.created_at.isoformat() if user.created_at else None,"last_seen_at":user.last_seen_at.isoformat() if user.last_seen_at else None}

@router.get("/plans")
def plans(db:Session=Depends(get_db)):
    rows=db.scalars(select(AdminPlan).where(AdminPlan.active.is_(True)).order_by(AdminPlan.price_cents,AdminPlan.id)).all()
    return [{"id":p.id,"code":p.code,"name":p.name,"description":p.description,"price_cents":p.price_cents,"trial_days":p.trial_days,"features":p.features_json or [],"limits":p.limits_json or {}} for p in rows]

@router.post("/register")
def register(response:Response,body:dict=Body(...),db:Session=Depends(get_db)):
    email=str(body.get("email","")).strip().lower();password=str(body.get("password",""));first=str(body.get("first_name","")).strip();last=str(body.get("last_name","")).strip();name=str(body.get("display_name","")).strip() or " ".join(x for x in [first,last] if x);plan_code=str(body.get("plan_code","free")).strip().lower()
    if not email or "@" not in email:raise HTTPException(status_code=400,detail="Valid email is required")
    if len(password)<8:raise HTTPException(status_code=400,detail="Password must be at least 8 characters")
    if db.scalar(select(AdminUser).where(AdminUser.email==email)):raise HTTPException(status_code=409,detail="An account with this email already exists. Please use a different email.")
    try:
        user=AdminUser(email=email,display_name=name,first_name=first,last_name=last,password_hash=hash_password(password),status="active");activate_registration_plan(db,user,plan_code);db.add(user);db.flush();user.last_seen_at=datetime.now(timezone.utc);db.commit()
    except IntegrityError:
        db.rollback();raise HTTPException(status_code=409,detail="An account with this email already exists. Please use a different email.")
    except Exception:
        db.rollback();raise
    user=_load_user(db,user.id)
    if user is None:raise HTTPException(status_code=500,detail="Account was created but could not be loaded. Please try signing in.")
    set_user_cookie(response,user);return _serialize(user,db)

@router.post("/login")
def login(response:Response,body:dict=Body(...),db:Session=Depends(get_db)):
    email=str(body.get("email","")).strip().lower();password=str(body.get("password",""));user=db.scalar(select(AdminUser).where(AdminUser.email==email))
    if not user or not user.password_hash or not verify_password(password,user.password_hash):raise HTTPException(status_code=401,detail="Invalid email or password")
    if user.status!="active":raise HTTPException(status_code=403,detail=f"Account is {user.status}")
    user.last_seen_at=datetime.now(timezone.utc);db.commit();user=_load_user(db,user.id)
    if user is None:raise HTTPException(status_code=500,detail="Account could not be loaded. Please try again.")
    set_user_cookie(response,user);return _serialize(user,db)

@router.post("/logout")
def logout(response:Response):clear_user_cookie(response);return {"authenticated":False}

@router.get("/session")
def session(request:Request,response:Response,db:Session=Depends(get_db)):
    user=get_current_user(request,db)
    if not user:clear_user_cookie(response);return {"authenticated":False}
    user.last_seen_at=datetime.now(timezone.utc);db.commit();user=_load_user(db,user.id)
    if user is None:clear_user_cookie(response);return {"authenticated":False}
    return {"authenticated":True,**_serialize(user,db)}

@router.get("/me")
def me(request:Request,db:Session=Depends(get_db)):return _serialize(require_user(request,db),db)

@router.patch("/profile")
def update_profile(request:Request,body:dict=Body(...),db:Session=Depends(get_db)):
    user=require_user(request,db);first=str(body.get("first_name",user.first_name or "")).strip();last=str(body.get("last_name",user.last_name or "")).strip()
    if len(first)>80 or len(last)>80:raise HTTPException(status_code=400,detail="Name is too long")
    user.first_name=first;user.last_name=last;user.display_name=" ".join(x for x in [first,last] if x);user.updated_at=datetime.now(timezone.utc);db.commit();return _serialize(_load_user(db,user.id),db)

@router.post("/password")
def change_password(request:Request,response:Response,body:dict=Body(...),db:Session=Depends(get_db)):
    user=require_user(request,db);current=str(body.get("current_password",""));new=str(body.get("new_password",""))
    if not verify_password(current,user.password_hash):raise HTTPException(status_code=400,detail="Current password is incorrect")
    if current==new:raise HTTPException(status_code=400,detail="New password must be different")
    try:user.password_hash=hash_password(new)
    except ValueError as exc:raise HTTPException(status_code=400,detail=str(exc)) from exc
    user.access_version+=1;user.updated_at=datetime.now(timezone.utc);db.commit();user=_load_user(db,user.id);set_user_cookie(response,user);return _serialize(user,db)
