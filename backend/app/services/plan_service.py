from __future__ import annotations
from datetime import datetime, timedelta, timezone
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from backend.app.models.admin import AdminPlan, AdminUsageEvent, AdminUser, AdminRole
PUBLIC_PLAN_CODES={"free","pro","enterprise"}

def utcnow()->datetime:return datetime.now(timezone.utc)

def _set_role_for_plan(db:Session,user:AdminUser,plan_code:str)->None:
    role_code="viewer" if plan_code=="free" else "analyst"
    role=db.scalar(select(AdminRole).where(AdminRole.code==role_code))
    if role and not any(r.code in {"owner","administrator"} for r in user.roles):user.roles=[role]

def effective_plan(db:Session,user:AdminUser)->AdminPlan:
    now=utcnow()
    if user.plan_status=="trialing" and user.trial_ends_at:
        if user.trial_ends_at>now and user.trial_plan:return user.trial_plan
        free=db.scalar(select(AdminPlan).where(AdminPlan.code=="free",AdminPlan.active.is_(True)))
        if free:
            user.plan_id=free.id;user.trial_plan_id=None;user.trial_started_at=None;user.trial_ends_at=None;user.plan_status="active";user.subscription_started_at=None;user.subscription_ends_at=None;user.updated_at=now
            _set_role_for_plan(db,user,"free");db.commit();user.plan=free;return free
    if user.plan:return user.plan
    free=db.scalar(select(AdminPlan).where(AdminPlan.code=="free",AdminPlan.active.is_(True)))
    if not free:raise RuntimeError("Free plan is not configured")
    user.plan_id=free.id;user.plan_status="active";user.updated_at=now;_set_role_for_plan(db,user,"free");db.commit();user.plan=free;return free

def activate_registration_plan(db:Session,user:AdminUser,requested_code:str)->AdminPlan:
    code=(requested_code or "free").strip().lower()
    if code not in PUBLIC_PLAN_CODES:code="free"
    plan=db.scalar(select(AdminPlan).where(AdminPlan.code==code,AdminPlan.active.is_(True)));free=db.scalar(select(AdminPlan).where(AdminPlan.code=="free",AdminPlan.active.is_(True)))
    if not plan or not free:raise RuntimeError("Registration plans are not configured")
    now=utcnow();user.plan_id=plan.id;user.plan_status="active";user.trial_plan_id=None;user.trial_started_at=None;user.trial_ends_at=None;user.subscription_started_at=None;user.subscription_ends_at=None
    if code!="free" and plan.trial_days>0:user.plan_status="trialing";user.trial_plan_id=plan.id;user.trial_started_at=now;user.trial_ends_at=now+timedelta(days=plan.trial_days)
    user.plan=plan;_set_role_for_plan(db,user,code);return plan

def search_usage(db:Session,user_id:int)->int:
    start=utcnow().replace(hour=0,minute=0,second=0,microsecond=0)
    return int(db.scalar(select(func.count(AdminUsageEvent.id)).where(AdminUsageEvent.user_id==user_id,AdminUsageEvent.event_type=="pattern_search",AdminUsageEvent.created_at>=start)) or 0)

def check_search_limit(db:Session,user:AdminUser,timeframe:str,top_k:int)->tuple[AdminPlan,int,int]:
    plan=effective_plan(db,user);limits=plan.limits_json or {};used=search_usage(db,user.id);daily=int(limits.get("searches_per_day",0))
    if daily>0 and used>=daily:raise PermissionError(f"Daily search limit reached for the {plan.name} plan ({daily} searches).")
    allowed=[str(x).lower() for x in limits.get("timeframes",[])]
    if allowed and timeframe.lower() not in allowed:raise PermissionError(f"{timeframe} timeframe is not available on the {plan.name} plan.")
    max_matches=int(limits.get("max_matches",10))
    if top_k>max_matches:raise PermissionError(f"This plan allows up to {max_matches} matches per search.")
    return plan,used,daily

def record_search(db:Session,user:AdminUser,symbol:str,timeframe:str,pattern_length:int,top_k:int)->None:
    db.add(AdminUsageEvent(user_id=user.id,event_type="pattern_search",module="market_memory",path="/api/v1/pattern-search",metadata_json={"symbol":symbol,"timeframe":timeframe,"pattern_length":pattern_length,"top_k":top_k}));db.commit()
