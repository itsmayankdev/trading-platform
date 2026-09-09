from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend.app.api.routes.search import router as search_router
from backend.app.api.routes.candles import router as candles_router
from backend.app.api.routes.alerts import router as alerts_router
from backend.app.api.routes.replay import router as replay_router
from backend.app.api.routes.evaluation import router as evaluation_router
from backend.app.api.routes.admin import router as admin_router
from backend.app.api.routes.auth import router as auth_router
from backend.app.api.routes.telemetry import router as telemetry_router
from backend.app.api.routes.instruments import router as instruments_router
from backend.app.api.routes.quote import router as quote_router
from backend.app.api.routes.global_markets import router as global_markets_router
from backend.app.db.init_db import init_db
from workers.ingestion.instrument_registry import InstrumentRegistrySync


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        result = InstrumentRegistrySync().sync()
        print(f"Binance instrument sync: {result}")
    except Exception as exc:
        print(f"Binance instrument sync skipped: {exc}")
    yield


app = FastAPI(title="Trading Platform API", version="0.5.0", docs_url="/docs", redoc_url="/redoc", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(telemetry_router)
app.include_router(instruments_router)
app.include_router(quote_router)
app.include_router(global_markets_router)
app.include_router(search_router)
app.include_router(candles_router)
app.include_router(alerts_router)
app.include_router(replay_router)
app.include_router(evaluation_router)
app.include_router(admin_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "trading-platform-api", "version": "0.5.0"}
