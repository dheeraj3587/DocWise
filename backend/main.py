"""
DocWise Backend — FastAPI Application
AI-Powered Document & Multimedia Q&A
"""

import logging
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.responses import Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from sqlalchemy import text

from core.config import settings
from models.database import engine
from routers import chat, conversations, files, notes, search, users
from services.storage_service import storage_service
from redis.asyncio import Redis
from core.observability import RequestObservabilityMiddleware

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle. Schema changes are owned by Alembic."""
    yield
    await engine.dispose()


app = FastAPI(
    title="DocWise API",
    description="AI-Powered Document & Multimedia Q&A Backend",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(RequestObservabilityMiddleware)

# CORS — allow Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(files.router, prefix="/api/files", tags=["Files"])
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])
app.include_router(conversations.router, prefix="/api/chat", tags=["Conversations"])
app.include_router(search.router, prefix="/api/search", tags=["Search"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(notes.router, prefix="/api/notes", tags=["Notes"])


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions so CORS headers are still returned."""
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "docwise-api"}


@app.get("/metrics", include_in_schema=False)
async def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/live")
@app.get("/api/live")
async def liveness_check():
    return {"status": "alive", "service": "docwise-api"}


@app.get("/ready")
@app.get("/api/ready")
async def readiness_check():
    checks = {
        "database": False,
        "schema": False,
        "redis": False,
        "worker": False,
        "objectStorage": False,
        "chatProvider": bool(settings.CEREBRAS_API_KEY or settings.OPENROUTER_API_KEY),
    }
    revision = None
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
            checks["database"] = True
            try:
                revision = (
                    await connection.execute(text("SELECT version_num FROM alembic_version LIMIT 1"))
                ).scalar_one_or_none()
                checks["schema"] = revision == settings.REQUIRED_SCHEMA_REVISION
            except Exception:
                checks["schema"] = connection.dialect.name == "sqlite"
    except Exception:
        logger.exception("Database readiness check failed")

    try:
        redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
        checks["redis"] = bool(await redis.ping())
        checks["worker"] = bool(await redis.get("docwise:worker:heartbeat"))
        await redis.aclose()
    except Exception:
        checks["redis"] = False

    checks["objectStorage"] = await asyncio.to_thread(storage_service.healthcheck)
    required_ready = checks["database"] and checks["schema"] and checks["objectStorage"]
    payload = {
        "status": "ready" if required_ready else "not_ready",
        "degraded": not checks["redis"] or not checks["worker"] or not checks["chatProvider"],
        "checks": checks,
        "schemaRevision": revision,
    }
    return JSONResponse(status_code=200 if required_ready else 503, content=payload)
