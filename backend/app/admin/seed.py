from __future__ import annotations
import os
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.app.auth.user_auth import hash_password
from backend.app.models.admin import AdminPermission, AdminPlan, AdminRole, AdminUser
MODULES=[("market_memory","Market Memory"),("pattern_quality","Pattern Quality"),("scanner","Market Scanner"),("alerts","Pattern Alerts"),("replay","Replay Lab"),("evaluation","Evaluation Lab"),("validation","Cross-Market Validation"),("favorites","Favorites"),("admin","Administration")]
OPERATIONS=["view","use","create","update","delete","manage"]
PLANS={
 "free":{"name":"Free","description":"A practical starting tier for exploring Market Memory.","price_cents":0,"trial_days":0,"limits":{"searches_per_day":10,"max_matches":5,"timeframes":["5m","15m","1h"]},"features":["10 historical searches per day","Up to 5 matches per search","5m, 15m and 1h analysis","Binance Spot markets","Yahoo / global market search","Personal watchlist"]},
 "pro":{"name":"Pro","description":"For active traders who want deeper historical research.","price_cents":0,"trial_days":3,"limits":{"searches_per_day":100,"trial_searches_per_day":20,"max_matches":20,"trial_max_matches":10,"timeframes":["1m","5m","15m","1h","4h","1d"]},"features":["100 searches per day after trial","Up to 20 matches per search","All supported timeframes","Binance + global markets","Advanced research modules","3-day trial with 20 searches/day"]},
 "enterprise":{"name":"Enterprise","description":"For advanced research and future team workflows.","price_cents":0,"trial_days":3,"limits":{"searches_per_day":500,"trial_searches_per_day":30,"max_matches":50,"trial_max_matches":15,"timeframes":["1m","5m","15m","1h","4h","1d"]},"features":["500 searches per day after trial","Up to 50 matches per search","All supported timeframes","Global market coverage","Advanced research and evaluation","3-day trial with 30 searches/day","Team-ready account foundation"]},
}

def seed_control_plane(db:Session)->None:
    for code,label in MODULES:
        for operation in OPERATIONS:
            pc=f"{code}.{operation}";p=db.scalar(select(AdminPermission).where(AdminPermission.code==pc))
            if not p:db.add(AdminPermission(code=pc,module=code,operation=operation,description=f"{operation.title()} {label}"))
    db.flush();defaults=[("owner","Owner","Full platform authority. Reserved for the configured owner.",True),("administrator","Administrator","Operational administration without owner credential control.",True),("analyst","Analyst","Research and analysis tools.",True),("support","Support","Customer and workspace support access.",True),("viewer","Viewer","Basic Market Memory access.",True)]
    all_permissions=list(db.scalars(select(AdminPermission)).all())
    for code,name,description,system in defaults:
        role=db.scalar(select(AdminRole).where(AdminRole.code==code))
        if not role:role=AdminRole(code=code,name=name,description=description,system=system);db.add(role);db.flush()
        if code=="owner":role.permissions=all_permissions
        elif code=="administrator":role.permissions=[p for p in all_permissions if p.module!="admin" or p.operation in {"view","use","manage"}]
        elif code=="analyst":role.permissions=[p for p in all_permissions if p.module in {"market_memory","pattern_quality","scanner","alerts","replay","evaluation","validation","favorites"} and p.operation in {"view","use","create","update"}]
        elif code=="support":role.permissions=[p for p in all_permissions if p.module in {"market_memory","pattern_quality","scanner","alerts","favorites"} and p.operation in {"view","use"}]
        elif code=="viewer":role.permissions=[p for p in all_permissions if p.module in {"market_memory","favorites"} and p.operation in {"view","use"}]
    for code,data in PLANS.items():
        plan=db.scalar(select(AdminPlan).where(AdminPlan.code==code))
        if not plan:plan=AdminPlan(code=code,name=data["name"],description=data["description"],price_cents=data["price_cents"],trial_days=data["trial_days"],limits_json=data["limits"],features_json=data["features"],active=True);db.add(plan)
        else:plan.name=data["name"];plan.description=data["description"];plan.price_cents=data["price_cents"];plan.trial_days=data["trial_days"];plan.limits_json=data["limits"];plan.features_json=data["features"];plan.active=True
    db.flush();free_id=db.scalar(select(AdminPlan.id).where(AdminPlan.code=="free"));pro_id=db.scalar(select(AdminPlan.id).where(AdminPlan.code=="pro"));analyst=db.scalar(select(AdminRole).where(AdminRole.code=="analyst"))
    for user in db.scalars(select(AdminUser)).all():
        if user.plan_id is None:user.plan_id=free_id;user.plan_status="active"
        if not user.roles and analyst:user.roles=[analyst]
    demo_email=os.getenv("DEMO_USER_EMAIL","demo-user@marketmemory.local").strip().lower();demo_password=os.getenv("DEMO_USER_PASSWORD","DemoUser@2026");demo=db.scalar(select(AdminUser).where(AdminUser.email==demo_email))
    if not demo:
        demo=AdminUser(email=demo_email,display_name="Demo User",password_hash=hash_password(demo_password),status="active",plan_id=pro_id,plan_status="active");demo.roles=[analyst] if analyst else [];db.add(demo)
    elif demo_email=="demo-user@marketmemory.local":demo.status="active";demo.plan_id=pro_id;demo.plan_status="active";demo.roles=[analyst] if analyst else []
    db.commit()
