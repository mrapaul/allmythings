"""
Grounding DINO Detection Service

Open-vocabulary object detection using Grounding DINO.
No hardcoded vocabulary — prompt-driven detection.
"""

import io
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image

model = None
processor = None

DETECTION_PROMPT = os.environ.get(
    "DETECTION_PROMPT",
    "household objects . furniture . appliances . electronics . decor . items",
)
BOX_THRESHOLD = float(os.environ.get("BOX_THRESHOLD", "0.3"))
TEXT_THRESHOLD = float(os.environ.get("TEXT_THRESHOLD", "0.25"))
MODEL_ID = os.environ.get("GROUNDING_DINO_MODEL", "IDEA-Research/grounding-dino-tiny")


class BoundingBox(BaseModel):
    x: float
    y: float
    w: float
    h: float


class DetectionResult(BaseModel):
    box: BoundingBox
    coarse_label: str
    confidence: float


class DetectionResponse(BaseModel):
    detections: list[DetectionResult]
    image_width: int
    image_height: int
    prompt_used: str


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    gpu_available: bool
    default_prompt: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model, processor
    print(f"Loading Grounding DINO model: {MODEL_ID}")

    try:
        import torch
        from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection

        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Using device: {device}")

        processor = AutoProcessor.from_pretrained(MODEL_ID)
        model = AutoModelForZeroShotObjectDetection.from_pretrained(MODEL_ID).to(device)
        print("Grounding DINO model loaded successfully")
    except Exception as e:
        print(f"Failed to load model: {e}")
        print("Service will start but return 503 on detection requests")

    yield

    model = None
    processor = None


app = FastAPI(
    title="Grounding DINO Detection Service",
    description="Open-vocabulary object detection — no hardcoded labels",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    import torch

    return HealthResponse(
        status="healthy" if model is not None else "unhealthy",
        model_loaded=model is not None,
        gpu_available=torch.cuda.is_available(),
        default_prompt=DETECTION_PROMPT,
    )


@app.post("/detect", response_model=DetectionResponse)
async def detect_objects(
    file: UploadFile = File(...),
    prompt: str = Form(default=None),
    box_threshold: float = Form(default=None),
    text_threshold: float = Form(default=None),
):
    if model is None or processor is None:
        raise HTTPException(
            status_code=503,
            detail="Model not loaded. Check /health for details.",
        )

    effective_prompt = prompt or DETECTION_PROMPT
    effective_box_threshold = box_threshold if box_threshold is not None else BOX_THRESHOLD
    effective_text_threshold = text_threshold if text_threshold is not None else TEXT_THRESHOLD

    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        img_width, img_height = image.size
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}")

    try:
        import torch

        device = next(model.parameters()).device
        inputs = processor(images=image, text=effective_prompt, return_tensors="pt").to(device)

        with torch.no_grad():
            outputs = model(**inputs)

        results = processor.post_process_grounded_object_detection(
            outputs,
            inputs.input_ids,
            box_threshold=effective_box_threshold,
            text_threshold=effective_text_threshold,
            target_sizes=[image.size[::-1]],
        )

        detections = []
        if results and len(results) > 0:
            result = results[0]
            boxes = result["boxes"]
            scores = result["scores"]
            labels = result.get("labels", result.get("text", []))

            for box, score, label in zip(boxes, scores, labels):
                x1, y1, x2, y2 = box.tolist()
                detections.append(
                    DetectionResult(
                        box=BoundingBox(
                            x=x1 / img_width,
                            y=y1 / img_height,
                            w=(x2 - x1) / img_width,
                            h=(y2 - y1) / img_height,
                        ),
                        coarse_label=label.strip().rstrip("."),
                        confidence=round(score.item(), 4),
                    )
                )

        return DetectionResponse(
            detections=detections,
            image_width=img_width,
            image_height=img_height,
            prompt_used=effective_prompt,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
