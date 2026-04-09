from __future__ import annotations
from contextlib import asynccontextmanager
from fastapi import FastAPI

from detection_service.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup hooks will be added in later tasks
    yield
    # Shutdown hooks

app = FastAPI(
    title="detection-service",
    version=settings.version,
    lifespan=lifespan,
)


@app.get("/")
async def root():
    return {"service": settings.service_name, "version": settings.version}
