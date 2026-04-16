import io
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image
import torch
from transformers import AutoProcessor, AutoModelForCausalLM

router = APIRouter()

_processor = None
_model = None


def _load():
    global _processor, _model
    if _processor is None:
        _processor = AutoProcessor.from_pretrained(
            "microsoft/Florence-2-large", trust_remote_code=True
        )
    if _model is None:
        _dtype = torch.float16 if torch.cuda.is_available() else torch.float32
        _model = AutoModelForCausalLM.from_pretrained(
            "microsoft/Florence-2-large",
            torch_dtype=_dtype,
            trust_remote_code=True,
        )
        _model = _model.eval()
        if torch.backends.mps.is_available():
            _model = _model.to("mps")
    return _processor, _model


@router.post("/detect/florence")
async def detect_florence(
    file: Annotated[UploadFile, File(description="JPEG or PNG image")],
):
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(415, f"unsupported content type: {file.content_type}")

    processor, model = _load()
    image_bytes = await file.read()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    W, H = image.size

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    task_prompt = "<DENSE_REGION_CAPTION>"
    inputs = processor(text=task_prompt, images=image, return_tensors="pt")
    inputs = {k: v.to(device) if hasattr(v, "to") else v for k, v in inputs.items()}

    with torch.inference_mode():
        generated_ids = model.generate(
            **inputs,
            max_new_tokens=1024,
            num_beams=3,
            do_sample=False,
        )

    generated_text = processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
    parsed = processor.post_process_generation(
        generated_text, task=task_prompt, image_size=(W, H)
    )

    raw_regions = parsed.get(task_prompt, {})
    bboxes = raw_regions.get("bboxes", [])
    labels = raw_regions.get("labels", [])

    regions = []
    for bbox, label in zip(bboxes, labels):
        x1, y1, x2, y2 = bbox
        regions.append({
            "caption": label.strip(),
            "x": max(0.0, min(1.0, x1 / W)),
            "y": max(0.0, min(1.0, y1 / H)),
            "width": max(0.0, min(1.0, (x2 - x1) / W)),
            "height": max(0.0, min(1.0, (y2 - y1) / H)),
        })

    return {"regions": regions, "image_width": W, "image_height": H}
