from fastapi import APIRouter, HTTPException, Query, Request, Depends
from sqlalchemy.orm import Session
from backend.app.auth.user_auth import require_permission, require_user
from backend.app.db.session import get_db
from backend.app.repositories.instrument import InstrumentRepository
from backend.app.search.service import PatternSearchService
router=APIRouter(prefix="/api/v1",tags=["pattern-search"])
instrument_repository=InstrumentRepository();service=PatternSearchService()
@router.get("/pattern-search")
def pattern_search(request:Request,symbol:str=Query(default="ETHUSDT",min_length=1,max_length=50),timeframe:str=Query(default="5m",min_length=1,max_length=10),pattern_length:int=Query(default=45,ge=5,le=500),top_k:int=Query(default=10,ge=1,le=50),db:Session=Depends(get_db)):
    user=require_user(request,db);require_permission(user,"market_memory.use");symbol,timeframe=symbol.upper(),timeframe.lower();instrument=instrument_repository.get_by_symbol(db=db,symbol=symbol)
    if instrument is None:raise HTTPException(status_code=404,detail=f"Instrument not found: {symbol}")
    try:return service.search(instrument_id=instrument.id,symbol=symbol,timeframe=timeframe,pattern_length=pattern_length,top_k=top_k)
    except ValueError as exc:raise HTTPException(status_code=400,detail=str(exc))
    except Exception:raise HTTPException(status_code=500,detail="Pattern search failed")
