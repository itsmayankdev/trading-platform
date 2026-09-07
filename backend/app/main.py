from fastapi import FastAPI

from backend.app.api.routes.search import router as search_router
from backend.app.api.routes.candles import router as candles_router


app = FastAPI(
    title="Trading Platform API",
    version="0.2.0",
    docs_url="/docs",
    redoc_url="/redoc",
)


app.include_router(search_router)
app.include_router(candles_router)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "trading-platform-api",
        "version": "0.2.0",
    }
