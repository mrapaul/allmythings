"""
Unified Detection Service (YOLOv11 + Grounding DINO)

High-performance object detection using Ultralytics YOLOv11
with Grounding DINO as a fallback/complementary layer.
"""

import io
import os
import torch
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
from ultralytics import YOLO

# Models
yolo_model = None
dino_model = None
dino_processor = None

# Config
YOLO_MODEL_ID = os.environ.get("YOLO_MODEL", "yolo11n.pt")
DINO_MODEL_ID = os.environ.get("GROUNDING_DINO_MODEL", "IDEA-Research/grounding-dino-tiny")
DETECTION_PROMPT = os.environ.get("DETECTION_PROMPT", "household objects . furniture . appliances . electronics . decor")
BOX_THRESHOLD = float(os.environ.get("BOX_THRESHOLD", "0.25"))

class BoundingBox(BaseModel):
    x: float
    y: float
    w: float
    h: float

class DetectionResult(BaseModel):
    box: BoundingBox
    coarse_label: str
    confidence: float
    provider: str

class DetectionResponse(BaseModel):
    detections: list[DetectionResult]
    image_width: int
    image_height: int
    providers_used: list[str]

@asynccontextmanager
async def lifespan(app: FastAPI):
    global yolo_model, dino_model, dino_processor
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {device}")

    # Load YOLO (Fast, Robust)
    try:
        print(f"Loading YOLO model: {YOLO_MODEL_ID}")
        yolo_model = YOLO(YOLO_MODEL_ID)
        print("YOLO model loaded successfully")
    except Exception as e:
        print(f"Failed to load YOLO: {e}")

    # Load DINO (Open Vocabulary)
    try:
        from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection
        print(f"Loading Grounding DINO model: {DINO_MODEL_ID}")
        dino_processor = AutoProcessor.from_pretrained(DINO_MODEL_ID)
        dino_model = AutoModelForZeroShotObjectDetection.from_pretrained(DINO_MODEL_ID).to(device)
        print("Grounding DINO loaded successfully")
    except Exception as e:
        print(f"Failed to load DINO (likely AVX issue): {e}")

    yield
    yolo_model = None
    dino_model = None

app = FastAPI(title="Unified Detection Service", version="3.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
async def health_check():
    return {
        "status": "healthy" if (yolo_model or dino_model) else "unhealthy",
        "yolo_loaded": yolo_model is not None,
        "dino_loaded": dino_model is not None,
        "device": str(next(yolo_model.parameters()).device) if yolo_model else "cpu"
    }

@app.post("/detect", response_model=DetectionResponse)
async def detect_objects(file: UploadFile = File(...), prompt: str = Form(default=None)):
    if not yolo_model and not dino_model:
        raise HTTPException(status_code=503, detail="No models loaded")

    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        img_width, img_height = image.size
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}")

    detections = []
    providers = []

    # 1. Run YOLOv11 (Primary Layer)
    if yolo_model:
        try:
            results = yolo_model(image, conf=BOX_THRESHOLD, verbose=False)
            providers.append("yolo11")
            for result in results:
                boxes = result.boxes
                for box in boxes:
                    # YOLO uses [x1, y1, x2, y2]
                    b = box.xyxy[0].tolist() 
                    conf = float(box.conf[0])
                    cls = int(box.cls[0])
                    label = yolo_model.names[cls]
                    
                    detections.append(DetectionResult(
                        box=BoundingBox(
                            x=b[0] / img_width,
                            y=b[1] / img_height,
                            w=(b[2] - b[0]) / img_width,
                            h=(b[3] - b[1]) / img_height,
                        ),
                        coarse_label=label,
                        confidence=round(conf, 4),
                        provider="yolo11"
                    ))
        except Exception as e:
            print(f"YOLO detection failed: {e}")

    # 2. Run DINO (Open Vocab Layer - if loaded and no YOLO results or specific prompt)
    if dino_model and (len(detections) < 3 or prompt):
        try:
            effective_prompt = prompt or DETECTION_PROMPT
            inputs = dino_processor(images=image, text=effective_prompt, return_tensors="pt").to(dino_model.device)
            with torch.no_grad():
                outputs = dino_model(**inputs)
            
            results = dino_processor.post_process_grounded_object_detection(
                outputs, inputs.input_ids, box_threshold=BOX_THRESHOLD, target_sizes=[image.size[::-1]]
            )
            
            if results:
                providers.append("dino")
                res = results[0]
                for box, score, label in zip(res["boxes"], res["scores"], res["labels"]):
                    b = box.tolist()
                    detections.append(DetectionResult(
                        box=BoundingBox(
                            x=b[0] / img_width,
                            y=b[1] / img_height,
                            w=(b[2] - b[0]) / img_width,
                            h=(b[3] - b[1]) / img_height,
                        ),
                        coarse_label=label,
                        confidence=round(score.item(), 4),
                        provider="dino"
                    ))
        except Exception as e:
            print(f"DINO detection failed: {e}")

    return DetectionResponse(
        detections=detections,
        image_width=img_width,
        image_height=img_height,
        providers_used=providers
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=14001)
