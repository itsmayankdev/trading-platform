from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, Body, Depends, Request
from sqlalchemy.orm import Session
from backend.app.auth.user_auth import require_user
from backend.app.db.session import get_db
from backend.app.models.admin import AdminUsageEvent
router=APIRouter(prefix="/api/v1/telemetry",tags=["telemetry"])
@router.post("/event")
def event(request:Request,body:dict=Body(...),db:Session=Depends(get_db)):
    user=require_user(request,db);event_type=str(body.get("event_type","page_view"))[:80];module=str(body.get("module","workspace"))[:80];path=str(body.get("path",request.headers.get("referer","") or ""))[:300];duration=max(0,min(int(body.get("duration_ms",0) or 0),3600000));metadata=body.get("metadata") if isinstance(body.get("metadata"),dict) else {}
    user.last_seen_at=datetime.now(timezone.utc);db.add(AdminUsageEvent(user_id=user.id,event_type=event_type,module=module,path=path,duration_ms=duration,metadata_json=metadata));db.commit();return {"recorded":True}
