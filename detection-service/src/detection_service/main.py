from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from detection_service.config import settings
from detection_service.telemetry import configure_telemetry, mount_prometheus
from detection_service.routes.florence import router as florence_router

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # FastAPI's lifespan protocol requires the app arg; we don't use it here.
    log.info("detection-service starting (Florence-2 lazy-loaded on first request)")
    yield
    log.info("detection-service stopping")


app = FastAPI(
    title="detection-service",
    version=settings.version,
    lifespan=lifespan,
)

configure_telemetry(app=app)
mount_prometheus(app)

app.include_router(florence_router, tags=["detect"])


@app.get("/")
async def root():
    return {"service": settings.service_name, "version": settings.version}


@app.get("/health")
async def health():
    """Lightweight liveness — does NOT probe the model.

    Florence is lazy-loaded; we only report whether the service process is up.
    Model loadedness is reported via /metrics (florence_model_loaded gauge).
    """
    return {"status": "ok", "service": settings.service_name}
