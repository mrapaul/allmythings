from pathlib import Path
from typing import Annotated
import io

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from PIL import Image
import torch
from transformers import Owlv2Processor, Owlv2ForObjectDetection

router = APIRouter()

_PROMPTS_FILE = Path(__file__).resolve().parents[4] / "api-service" / "prompts" / "household-classes.txt"

_processor: Owlv2Processor | None = None
_model: Owlv2ForObjectDetection | None = None
_classes: list[str] | None = None


def _load():
    global _processor, _model, _classes
    if _processor is None:
        _processor = Owlv2Processor.from_pretrained("google/owlv2-base-patch16-ensemble")
    if _model is None:
        _model = Owlv2ForObjectDetection.from_pretrained(
            "google/owlv2-base-patch16-ensemble",
            torch_dtype=torch.float16,
        )
        _model = _model.eval()  # torch nn.Module.eval() — switches to inference mode
        if torch.backends.mps.is_available():
            _model = _model.to("mps")
    if _classes is None:
        if not _PROMPTS_FILE.exists():
            _classes = ["furniture", "electronic", "decor", "plant"]
        else:
            _classes = [line.strip() for line in _PROMPTS_FILE.read_text().splitlines() if line.strip()]
    return _processor, _model, _classes


@router.post("/detect/owlv2")
async def detect_owlv2(
    file: Annotated[UploadFile, File(description="JPEG or PNG image")],
    score_threshold: Annotated[float, Form()] = 0.15,
):
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(415, f"unsupported content type: {file.content_type}")
    processor, model, classes = _load()
    image_bytes = await file.read()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    with torch.inference_mode():
        inputs = processor(text=[classes], images=image, return_tensors="pt")
        if torch.backends.mps.is_available():
            inputs = {k: v.to("mps") for k, v in inputs.items()}
        outputs = model(**inputs)

        W, H = image.size
        results = processor.post_process_grounded_object_detection(
            outputs=outputs,
            threshold=score_threshold,
            target_sizes=[(H, W)],
            text_labels=[classes],
        )[0]

    boxes = []
    for score, label, box in zip(results["scores"], results["text_labels"], results["boxes"]):
        x1, y1, x2, y2 = box.tolist()
        boxes.append({
            "label": label,
            "score": float(score),
            "x": max(0.0, min(1.0, x1 / W)),
            "y": max(0.0, min(1.0, y1 / H)),
            "width": max(0.0, min(1.0, (x2 - x1) / W)),
            "height": max(0.0, min(1.0, (y2 - y1) / H)),
        })
    boxes.sort(key=lambda b: b["score"], reverse=True)
    return {"boxes": boxes, "image_width": W, "image_height": H}
