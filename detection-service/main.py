from __future__ import annotations
from contextlib import asynccontextmanager
from fastapi import FastAPI

from detection_service.config import settings
from detection_service.telemetry import configure_telemetry, mount_prometheus


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(
    title="detection-service",
    version=settings.version,
    lifespan=lifespan,
)

configure_telemetry(app=app)
mount_prometheus(app)


@app.get("/")
async def root():
    return {"service": settings.service_name, "version": settings.version}
