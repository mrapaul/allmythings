"""
YOLO-World Home Object Detection Service

Uses YOLO-World for zero-shot detection with a comprehensive home inventory vocabulary.
This allows detecting specific furniture and home items without training a custom model.
"""

import io
import uuid
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
import numpy as np

# Will be initialized on startup
model_world = None
model_rtdetr = None

# Default open vocabulary if none provided
DEFAULT_VOCABULARY = ["object", "furniture", "electronics", "clothing", "book", "tool", "toy", "plant", "food"]

# Create a thread pool for concurrent model execution
import asyncio
from concurrent.futures import ThreadPoolExecutor
executor = ThreadPoolExecutor(max_workers=4)

class BoundingBox(BaseModel):
    x: float  # normalized 0-1
    y: float
    width: float
    height: float


class Detection(BaseModel):
    id: str
    label: str
    confidence: float
    boundingBox: BoundingBox
    source_model: Optional[str] = None


class DetectionResponse(BaseModel):
    detections: List[Detection]
    imageWidth: int
    imageHeight: int
    provider: str


class HealthResponse(BaseModel):
    status: str
    yolo_world_loaded: bool
    rt_detr_loaded: bool
    classes_count: int


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load models on startup"""
    global model_world, model_rtdetr
    print("Loading models...")
    
    try:
        from ultralytics import YOLO, RTDETR
        
        # 1. Load YOLO-World (Medium)
        print("Loading YOLO-World (yolov8m-worldv2.pt)...")
        model_world = YOLO("yolov8m-worldv2.pt")
        model_world.set_classes(DEFAULT_VOCABULARY)
        print(f"YOLO-World loaded with {len(DEFAULT_VOCABULARY)} default classes")

        # 2. Load RT-DETR (Large)
        print("Loading RT-DETR (rtdetr-l.pt)...")
        model_rtdetr = RTDETR("rtdetr-l.pt") 
        print("RT-DETR loaded")

    except Exception as e:
        print(f"Error loading models: {e}")
    
    yield
    
    # Cleanup
    model_world = None
    model_rtdetr = None


app = FastAPI(
    title="Home Object Detection Service",
    description="Multi-model detection service (YOLO-World + RT-DETR) with internal fusion",
    version="1.2.0",
    lifespan=lifespan,
)

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Check service health and model status"""
    status = "healthy"
    if model_world is None and model_rtdetr is None:
        status = "unhealthy"
    elif model_world is None or model_rtdetr is None:
        status = "degraded"

    return HealthResponse(
        status=status,
        yolo_world_loaded=model_world is not None,
        rt_detr_loaded=model_rtdetr is not None,
        classes_count=len(DEFAULT_VOCABULARY),
    )


def calculate_iou(box1, box2):
    """Calculate Intersection over Union (IoU) between two normalized boxes [x, y, w, h]"""
    # Convert to x1, y1, x2, y2
    b1_x1, b1_y1 = box1[0], box1[1]
    b1_x2, b1_y2 = box1[0] + box1[2], box1[1] + box1[3]
    
    b2_x1, b2_y1 = box2[0], box2[1]
    b2_x2, b2_y2 = box2[0] + box2[2], box2[1] + box2[3]
    
    # Intersection coordinates
    x1 = max(b1_x1, b2_x1)
    y1 = max(b1_y1, b2_y1)
    x2 = min(b1_x2, b2_x2)
    y2 = min(b1_y2, b2_y2)
    
    if x2 < x1 or y2 < y1:
        return 0.0
        
    intersection = (x2 - x1) * (y2 - y1)
    b1_area = box1[2] * box1[3]
    b2_area = box2[2] * box2[3]
    union = b1_area + b2_area - intersection
    
    if union <= 0:
        return 0.0
        
    return intersection / union

def run_model_inference(model, image, conf, iou):
    """Run inference on a single model safely"""
    if model is None:
        return []
    try:
        return model.predict(source=image, conf=conf, iou=iou, verbose=False)
    except Exception as e:
        print(f"Model inference failed: {e}")
        return []

def process_results(results, model_name, img_width, img_height, custom_classes=None):
    """Convert model results to standardized detection objects"""
    processed = []
    if not results or len(results) == 0:
        return processed
        
    result = results[0]
    boxes = result.boxes
    
    if boxes is None:
        return processed
        
    for i, box in enumerate(boxes):
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        
        # Normalize
        norm_x = x1 / img_width
        norm_y = y1 / img_height
        norm_w = (x2 - x1) / img_width
        norm_h = (y2 - y1) / img_height
        
        # Clamp to 0-1
        norm_x = max(0.0, min(1.0, norm_x))
        norm_y = max(0.0, min(1.0, norm_y))
        norm_w = max(0.0, min(1.0, norm_w))
        norm_h = max(0.0, min(1.0, norm_h))
        
        cls_id = int(box.cls[0])
        conf = float(box.conf[0])
        
        # Resolve Label
        label = "unknown"
        if custom_classes:
            if cls_id < len(custom_classes):
                label = custom_classes[cls_id]
            else:
                label = f"object_{cls_id}"
        elif hasattr(result, 'names') and cls_id in result.names:
            label = result.names[cls_id]
        else:
            label = f"class_{cls_id}"
            
        processed.append({
            "box": [norm_x, norm_y, norm_w, norm_h],
            "label": label,
            "score": conf,
            "source": model_name
        })
    return processed

def fuse_detections(detections_world, detections_rtdetr, iou_threshold=0.6):
    """
    Fuse detections from YOLO-World and RT-DETR.
    Algorithm:
    1. Start with RT-DETR detections (usually higher objectness).
    2. Try to match with YOLO-World detections.
    3. If match:
       - Update Label: Prefer YOLO-World if available (more specific).
       - Update Box: Average of both.
       - Update Score: Average of both.
    4. Keep unmatched YOLO-World detections (items RT-DETR missed).
    5. Keep unmatched RT-DETR detections.
    """
    fused_results = []
    used_world_indices = set()
    
    # 1. Iterate RT-DETR detections
    for r_det in detections_rtdetr:
        best_iou = 0
        best_w_idx = -1
        
        # Find best matching YOLO-World detection
        for i, w_det in enumerate(detections_world):
            if i in used_world_indices:
                continue
            iou = calculate_iou(r_det["box"], w_det["box"])
            if iou > best_iou:
                best_iou = iou
                best_w_idx = i
        
        # 2. Match Found
        if best_iou > iou_threshold:
            w_det = detections_world[best_w_idx]
            used_world_indices.add(best_w_idx)
            
            # Fuse
            avg_box = [
                (r_det["box"][0] + w_det["box"][0]) / 2,
                (r_det["box"][1] + w_det["box"][1]) / 2,
                (r_det["box"][2] + w_det["box"][2]) / 2,
                (r_det["box"][3] + w_det["box"][3]) / 2
            ]
            avg_score = (r_det["score"] + w_det["score"]) / 2
            
            # Label Preference: YOLO-World > RT-DETR (due to custom vocab)
            # Unless YOLO-World confidence is significantly lower? 
            # For now, trust YOLO-World label as it's the domain expert model.
            final_label = w_det["label"]
            
            fused_results.append({
                "box": avg_box,
                "label": final_label,
                "score": avg_score,
                "source": "ensemble"
            })
        else:
            # 3. No match, keep RT-DETR (it found something YOLO missed)
            fused_results.append(r_det)
            
    # 4. Add remaining unmatched YOLO-World detections
    for i, w_det in enumerate(detections_world):
        if i not in used_world_indices:
            fused_results.append(w_det)
            
    # Convert to Detection objects
    final_objects = []
    for res in fused_results:
        final_objects.append(Detection(
            id=f"ens-{uuid.uuid4().hex[:8]}",
            label=res["label"],
            confidence=round(res["score"], 3),
            boundingBox=BoundingBox(
                x=round(res["box"][0], 4),
                y=round(res["box"][1], 4),
                width=round(res["box"][2], 4),
                height=round(res["box"][3], 4),
            ),
            source_model=res.get("source", "unknown")
        ))
        
    return final_objects


@app.post("/detect", response_model=DetectionResponse)
async def detect_objects(
    file: UploadFile = File(...),
    confidence: float = 0.25,
    iou_threshold: float = 0.45,
):
    """
    Detect home objects using an internal ensemble of RT-DETR and YOLO-World.
    Returns a unified list of distinct objects.
    """
    
    if model_world is None and model_rtdetr is None:
        raise HTTPException(status_code=503, detail="No models loaded")

    # Read and validate image
    try:
        contents = await file.read()
        print(f"Received file: {file.filename}, size: {len(contents)} bytes, content_type: {file.content_type}")
        image = Image.open(io.BytesIO(contents))
        if image.mode != "RGB":
            image = image.convert("RGB")
        img_width, img_height = image.size
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {str(e)}")

    # Concurrent Inference
    try:
        loop = asyncio.get_running_loop()
        
        # Schedule both models
        # RT-DETR usually benefits from standard confidence
        # YOLO-World we pass the user confidence
        
        tasks = []
        if model_world:
            tasks.append(loop.run_in_executor(
                executor, run_model_inference, model_world, image, confidence, iou_threshold
            ))
        else:
            tasks.append(asyncio.sleep(0)) # dummy
            
        if model_rtdetr:
            tasks.append(loop.run_in_executor(
                executor, run_model_inference, model_rtdetr, image, confidence, iou_threshold
            ))
        else:
            tasks.append(asyncio.sleep(0)) # dummy
            
        # Wait for both
        results = await asyncio.gather(*tasks)
        
        res_world = results[0] if model_world else []
        res_rtdetr = results[1] if model_rtdetr else []
        
        # Process Raw Results
        processed_world = process_results(res_world, "yolo-world", img_width, img_height, custom_classes=DEFAULT_VOCABULARY)
        processed_rtdetr = process_results(res_rtdetr, "rt-detr", img_width, img_height)
        
        # Fuse
        final_detections = fuse_detections(processed_world, processed_rtdetr)

        return DetectionResponse(
            detections=final_detections,
            imageWidth=img_width,
            imageHeight=img_height,
            provider="internal-ensemble-v1",
        )

    except Exception as e:
        print(f"Ensemble detection failed: {e}")
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")


@app.get("/classes")
async def get_classes():
    """Get the list of detectable object classes"""
    return {"classes": DEFAULT_VOCABULARY, "count": len(DEFAULT_VOCABULARY)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
