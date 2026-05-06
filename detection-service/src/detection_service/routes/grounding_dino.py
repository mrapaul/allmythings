"""Grounding DINO HF text-prompted object detector on Apple Silicon mps.

Mirror-shape of /detect/owlv2: accepts a multipart image plus a list of
text prompts, returns boxes in normalized coordinates with scores and
labels. The pipeline-service GroundingBackend wraps this via HTTP.

Lazy-loaded on first request (~700MB download from HuggingFace for
``IDEA-Research/grounding-dino-tiny`` — fits comfortably in M-series
unified memory).
"""
from __future__ import annotations

import io
import json
from typing import Annotated

import torch
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from PIL import Image
from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor

router = APIRouter()

_MODEL_ID = "IDEA-Research/grounding-dino-tiny"

_processor: AutoProcessor | None = None
_model: AutoModelForZeroShotObjectDetection | None = None


def _load() -> tuple[AutoProcessor, AutoModelForZeroShotObjectDetection]:
    global _processor, _model
    if _processor is None:
        _processor = AutoProcessor.from_pretrained(_MODEL_ID)
    if _model is None:
        m = AutoModelForZeroShotObjectDetection.from_pretrained(_MODEL_ID)
        m.train(False)  # inference-only mode (equivalent to nn.Module.eval())
        if torch.backends.mps.is_available():
            m = m.to("mps")
        _model = m
    return _processor, _model


def _normalise_prompts(prompts: list[str]) -> str:
    """Grounding DINO expects a single string with prompts separated by
    `. ` and ending with `.`. Each prompt should be lowercase; the model
    is sensitive to input formatting."""
    cleaned = [p.strip().lower().rstrip(".") for p in prompts if p.strip()]
    if not cleaned:
        return ""
    return ". ".join(cleaned) + "."


@router.post("/detect/grounding_dino")
async def detect_grounding_dino(
    file: Annotated[UploadFile, File(description="JPEG or PNG image")],
    prompts_json: Annotated[str, Form(description='JSON array of category strings')],
    # Defaults match the official IDEA-Research/grounding-dino-tiny
    # README: box_threshold=0.40 (similarity for box selection),
    # text_threshold=0.30 (similarity for text-token alignment). The
    # previous 0.30/0.25 values let too many borderline matches through
    # and produced hallucinated detections when a noisy prompt was
    # supplied.
    box_threshold: Annotated[float, Form()] = 0.40,
    text_threshold: Annotated[float, Form()] = 0.30,
):
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(415, f"unsupported content type: {file.content_type}")
    try:
        prompt_list = json.loads(prompts_json)
        if not isinstance(prompt_list, list):
            raise ValueError("prompts must be a JSON array of strings")
    except (json.JSONDecodeError, ValueError) as e:
        raise HTTPException(400, f"invalid prompts_json: {e}") from e

    text_prompt = _normalise_prompts(prompt_list)
    image_bytes = await file.read()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    W, H = image.size

    if not text_prompt:
        return {"boxes": [], "image_width": W, "image_height": H}

    processor, model = _load()
    inputs = processor(images=image, text=text_prompt, return_tensors="pt")
    if torch.backends.mps.is_available():
        inputs = {k: v.to("mps") if hasattr(v, "to") else v for k, v in inputs.items()}

    with torch.inference_mode():
        outputs = model(**inputs)

    results = processor.post_process_grounded_object_detection(
        outputs,
        inputs.get("input_ids"),
        threshold=box_threshold,
        text_threshold=text_threshold,
        target_sizes=[(H, W)],
    )[0]

    # Same MPS hygiene as Florence — release the allocator's cached
    # intermediate buffers so Ollama can fit Qwen-VL on Metal for the
    # next pipeline stage.
    del inputs, outputs
    if torch.backends.mps.is_available():
        torch.mps.empty_cache()

    boxes = []
    for score, label, box in zip(results["scores"], results["labels"], results["boxes"]):
        x1, y1, x2, y2 = box.tolist()
        boxes.append({
            "label": str(label),
            "score": float(score),
            "x": max(0.0, min(1.0, x1 / W)),
            "y": max(0.0, min(1.0, y1 / H)),
            "width": max(0.0, min(1.0, (x2 - x1) / W)),
            "height": max(0.0, min(1.0, (y2 - y1) / H)),
        })
    boxes.sort(key=lambda b: b["score"], reverse=True)
    return {"boxes": boxes, "image_width": W, "image_height": H}
