from __future__ import annotations
import time
import io
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, File, UploadFile, HTTPException
from PIL import Image

from detection_service.config import settings
from detection_service.telemetry import configure_telemetry, mount_prometheus
from detection_service.backends.mlx_backend import MLXBackend
from detection_service.routes.owlv2 import router as owlv2_router
from detection_service.routes.florence import router as florence_router

log = logging.getLogger(__name__)

_backend: MLXBackend | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _backend
    _backend = MLXBackend()
    _backend.load_fast_models()
    log.info("MLXBackend fast models loaded at startup")
    yield
    _backend = None


app = FastAPI(
    title="detection-service",
    version=settings.version,
    lifespan=lifespan,
)

configure_telemetry(app=app)
mount_prometheus(app)

app.include_router(owlv2_router, tags=["detect"])
app.include_router(florence_router, tags=["detect"])


@app.get("/")
async def root():
    return {"service": settings.service_name, "version": settings.version}


@app.post("/detect/fast")
async def detect_fast(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    image_bytes = await file.read()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    start = time.monotonic()
    detections = _backend.fast_detect(image)
    elapsed_ms = int((time.monotonic() - start) * 1000)

    return {
        "detections": [
            {
                "box": [d.box.x, d.box.y, d.box.w, d.box.h],
                "label": d.label,
                "confidence": d.confidence,
                "provider": d.source,
            }
            for d in detections
        ],
        "processing_ms": elapsed_ms,
        "tiles_used": 1 + settings.sahi_grid_cols * settings.sahi_grid_rows,
    }
