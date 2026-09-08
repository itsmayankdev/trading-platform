from __future__ import annotations
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Body, Depends, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload
from backend.app.admin.control import audit, clear_admin_cookie, require_admin, set_admin_cookie, user_access, verify_owner_credentials
from backend.app.auth.user_auth import hash_password
from backend.app.db.session import get_db
from backend.app.models.admin import AdminAuditLog, AdminPermission, AdminPlan, AdminRole, AdminUsageEvent, AdminUser, AdminUserModule
router=APIRouter(prefix="/api/v1/admin",tags=["admin"])
def _user(db:Session,user_id:int)->AdminUser:
    user=db.scalar(select(AdminUser).options(selectinload(AdminUser.roles).selectinload(AdminRole.permissions),selectinload(AdminUser.permissions),selectinload(AdminUser.module_overrides),selectinload(AdminUser.plan)).where(AdminUser.id==user_id))
    if not user:raise ValueError("User not found")
    return user
def _serialize_user(user:AdminUser)->dict:
    access=user_access(user); return {"id":user.id,"email":user.email,"display_name":user.display_name,"status":user.status,"plan":{"id":user.plan.id,"code":user.plan.code,"name":user.plan.name} if user.plan else None,"roles":[{"id":r.id,"code":r.code,"name":r.name} for r in user.roles],"permissions":access["permissions"],"modules":access["modules"],"access_version":user.access_version,"last_seen_at":user.last_seen_at,"created_at":user.created_at}
@router.post("/login")
def login(response:Response,body:dict=Body(...)):
    email,password=str(body.get("email","")),str(body.get("password",""))
    try:ok=verify_owner_credentials(email,password)
    except RuntimeError as exc:return JSONResponse(status_code=503,content={"detail":str(exc)})
    if not ok:return JSONResponse(status_code=401,content={"detail":"Invalid owner credentials"})
    set_admin_cookie(response,email);return {"authenticated":True,"email":email.strip().lower()}
@router.post("/logout")
def logout(response:Response,request:Request):clear_admin_cookie(response);return {"authenticated":False}
@router.get("/session")
def session(request:Request):
    try:email=require_admin(request)
    except Exception:return {"authenticated":False}
    return {"authenticated":True,"email":email,"owner":True}
@router.get("/overview")
def overview(request:Request,db:Session=Depends(get_db)):
    actor=require_admin(request);now=datetime.now(timezone.utc);day=now-timedelta(days=1);week=now-timedelta(days=7)
    users=db.scalar(select(func.count(AdminUser.id))) or 0;active=db.scalar(select(func.count(AdminUser.id)).where(AdminUser.status=="active")) or 0;new_24h=db.scalar(select(func.count(AdminUser.id)).where(AdminUser.created_at>=day)) or 0;returning=db.scalar(select(func.count(AdminUser.id)).where(AdminUser.last_seen_at>=week,AdminUser.created_at<week)) or 0;events=db.scalar(select(func.count(AdminUsageEvent.id)).where(AdminUsageEvent.created_at>=day)) or 0;time_ms=db.scalar(select(func.coalesce(func.sum(AdminUsageEvent.duration_ms),0)).where(AdminUsageEvent.created_at>=day)) or 0;top_modules=db.execute(select(AdminUsageEvent.module,func.count(AdminUsageEvent.id).label("count")).where(AdminUsageEvent.created_at>=week).group_by(AdminUsageEvent.module).order_by(func.count(AdminUsageEvent.id).desc()).limit(12)).all()
    return {"owner":actor,"users":users,"active_users":active,"new_users_24h":new_24h,"returning_users_7d":returning,"events_24h":events,"time_spent_ms_24h":int(time_ms),"top_modules":[{"module":m,"count":int(c)} for m,c in top_modules]}
@router.get("/users")
def users(request:Request,q:str="",status:str="",db:Session=Depends(get_db)):
    require_admin(request);stmt=select(AdminUser).options(selectinload(AdminUser.roles),selectinload(AdminUser.plan)).order_by(AdminUser.created_at.desc()).limit(500)
    if q:stmt=stmt.where((AdminUser.email.ilike(f"%{q}%"))|(AdminUser.display_name.ilike(f"%{q}%")))
    if status:stmt=stmt.where(AdminUser.status==status)
    return [_serialize_user(_user(db,u.id)) for u in db.scalars(stmt).all()]
@router.post("/users")
def create_user(request:Request,body:dict=Body(...),db:Session=Depends(get_db)):
    actor=require_admin(request);email=str(body.get("email","")).strip().lower();password=str(body.get("password",""));
    if not email or "@" not in email:return JSONResponse(status_code=400,content={"detail":"Valid email is required"})
    if not password: return JSONResponse(status_code=400,content={"detail":"Password is required"})
    if db.scalar(select(AdminUser).where(AdminUser.email==email)):return JSONResponse(status_code=409,content={"detail":"User already exists"})
    user=AdminUser(email=email,display_name=str(body.get("display_name","")).strip(),password_hash=hash_password(password),status=str(body.get("status","active")));plan_id=body.get("plan_id")
    if plan_id is not None:user.plan_id=int(plan_id)
    db.add(user);db.flush();role_ids=[int(x) for x in body.get("role_ids",[])];
    if role_ids:user.roles=list(db.scalars(select(AdminRole).where(AdminRole.id.in_(role_ids))).all())
    audit(db,actor,"user.created","user",str(user.id),{"email":user.email});db.commit();return _serialize_user(_user(db,user.id))
@router.get("/users/{user_id}")
def user_detail(user_id:int,request:Request,db:Session=Depends(get_db)):
    require_admin(request)
    try:return _serialize_user(_user(db,user_id))
    except ValueError as exc:return JSONResponse(status_code=404,content={"detail":str(exc)})
@router.patch("/users/{user_id}")
def update_user(user_id:int,request:Request,body:dict=Body(...),db:Session=Depends(get_db)):
    actor=require_admin(request)
    try:user=_user(db,user_id)
    except ValueError as exc:return JSONResponse(status_code=404,content={"detail":str(exc)})
    for field in ("display_name","status"):
        if field in body:setattr(user,field,str(body[field]))
    if "password" in body and body["password"]:user.password_hash=hash_password(str(body["password"]))
    if "plan_id" in body:user.plan_id=int(body["plan_id"]) if body["plan_id"] is not None else None
    if "role_ids" in body:
        ids=[int(x) for x in body["role_ids"]];user.roles=list(db.scalars(select(AdminRole).where(AdminRole.id.in_(ids))).all()) if ids else []
    if "permission_codes" in body:
        codes=[str(x) for x in body["permission_codes"]];user.permissions=list(db.scalars(select(AdminPermission).where(AdminPermission.code.in_(codes))).all()) if codes else []
    if "modules" in body:
        user.module_overrides.clear();user.module_overrides.extend(AdminUserModule(module=str(k),enabled=bool(v)) for k,v in (body["modules"] or {}).items())
    user.access_version+=1;audit(db,actor,"user.access_updated","user",str(user.id),{"access_version":user.access_version});db.commit();return _serialize_user(_user(db,user.id))
@router.get("/roles")
def roles(request:Request,db:Session=Depends(get_db)):
    require_admin(request);rows=db.scalars(select(AdminRole).options(selectinload(AdminRole.permissions),selectinload(AdminRole.users)).order_by(AdminRole.id)).all();return [{"id":r.id,"code":r.code,"name":r.name,"description":r.description,"system":r.system,"user_count":len(r.users),"permission_codes":sorted(p.code for p in r.permissions)} for r in rows]
@router.patch("/roles/{role_id}")
def update_role(role_id:int,request:Request,body:dict=Body(...),db:Session=Depends(get_db)):
    actor=require_admin(request);role=db.get(AdminRole,role_id)
    if not role:return JSONResponse(status_code=404,content={"detail":"Role not found"})
    if "name" in body:role.name=str(body["name"])
    if "description" in body:role.description=str(body["description"])
    if "permission_codes" in body:role.permissions=list(db.scalars(select(AdminPermission).where(AdminPermission.code.in_([str(x) for x in body["permission_codes"]]))).all())
    audit(db,actor,"role.permissions_updated","role",str(role.id),{"permissions":[p.code for p in role.permissions]});db.commit();return {"id":role.id,"code":role.code,"name":role.name,"permission_codes":sorted(p.code for p in role.permissions)}
@router.get("/permissions")
def permissions(request:Request,db:Session=Depends(get_db)):
    require_admin(request);return [{"id":p.id,"code":p.code,"module":p.module,"operation":p.operation,"description":p.description} for p in db.scalars(select(AdminPermission).order_by(AdminPermission.module,AdminPermission.operation)).all()]
@router.get("/plans")
def plans(request:Request,db:Session=Depends(get_db)):
    require_admin(request);return [{"id":p.id,"code":p.code,"name":p.name,"description":p.description,"price_cents":p.price_cents,"active":p.active} for p in db.scalars(select(AdminPlan).order_by(AdminPlan.id)).all()]
@router.patch("/plans/{plan_id}")
def update_plan(plan_id:int,request:Request,body:dict=Body(...),db:Session=Depends(get_db)):
    actor=require_admin(request);plan=db.get(AdminPlan,plan_id)
    if not plan:return JSONResponse(status_code=404,content={"detail":"Plan not found"})
    for field in ("name","description","price_cents","active"):
        if field in body:setattr(plan,field,body[field])
    audit(db,actor,"plan.updated","plan",str(plan.id),{"code":plan.code});db.commit();return {"id":plan.id,"code":plan.code,"name":plan.name,"description":plan.description,"price_cents":plan.price_cents,"active":plan.active}
@router.get("/audit")
def audit_log(request:Request,limit:int=100,db:Session=Depends(get_db)):
    require_admin(request);rows=db.scalars(select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).limit(min(max(limit,1),500))).all();return [{"id":x.id,"actor_email":x.actor_email,"action":x.action,"target_type":x.target_type,"target_id":x.target_id,"metadata":x.metadata_json,"created_at":x.created_at} for x in rows]
@router.get("/access-matrix")
def access_matrix(request:Request,db:Session=Depends(get_db)):
    require_admin(request);roles=db.scalars(select(AdminRole).options(selectinload(AdminRole.permissions)).order_by(AdminRole.id)).all();permissions=db.scalars(select(AdminPermission).order_by(AdminPermission.module,AdminPermission.operation)).all();return {"roles":[{"id":r.id,"code":r.code,"name":r.name,"system":r.system,"permission_codes":sorted(p.code for p in r.permissions)} for r in roles],"permissions":[{"id":p.id,"code":p.code,"module":p.module,"operation":p.operation,"description":p.description} for p in permissions]}
