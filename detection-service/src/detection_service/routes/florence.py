import io
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image, ImageOps
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
        # `attn_implementation="eager"` is required for Florence-2 with
        # transformers >=4.49 — its custom modeling code doesn't define
        # `_supports_sdpa`, and the default SDPA path raises an
        # AttributeError when transformers tries to validate the flag.
        # Florence-2 was authored against the eager attention path; eager
        # is also a no-op on MPS where flash/SDPA aren't available, so
        # there's no perf cost on Apple Silicon.
        _model = AutoModelForCausalLM.from_pretrained(
            "microsoft/Florence-2-large",
            torch_dtype=_dtype,
            trust_remote_code=True,
            attn_implementation="eager",
        )
        _model.train(False)
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
    image = Image.open(io.BytesIO(image_bytes))
    # iPhone photos carry EXIF Orientation (often 6 = 90° CW); Florence-2's
    # dense-region head collapses to a single whole-scene caption on
    # sideways images. Apply the rotation before measuring W/H so all
    # downstream coordinates match the visually-upright image.
    image = ImageOps.exif_transpose(image).convert("RGB")
    W, H = image.size

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    # `<DENSE_REGION_CAPTION>` returns more regions per scene than
    # `<OD>` (which collapses to one big "furniture" box for typical
    # household photos). Captions are verbose ("studio couch", "living
    # room with gray sofa..."); these end up only as `primaryLabel` —
    # the user-facing name comes from Qwen-VL on the per-bbox crop.
    task_prompt = "<DENSE_REGION_CAPTION>"
    inputs = processor(text=task_prompt, images=image, return_tensors="pt")
    inputs = {k: v.to(device) if hasattr(v, "to") else v for k, v in inputs.items()}

    with torch.inference_mode():
        # `use_cache=False` is required for Florence-2 with transformers
        # >=4.49 — its custom `prepare_inputs_for_generation` expects the
        # legacy tuple-based KV-cache shape (`past_key_values[0][0].shape`)
        # but modern transformers passes a `DynamicCache` object instead.
        # Disabling cache forces the eager path that Florence-2 was authored
        # against. Cost is minimal for the dense-region task: we generate
        # one shot of ~1024 tokens, no autoregressive feedback loop.
        generated_ids = model.generate(
            **inputs,
            max_new_tokens=1024,
            num_beams=3,
            do_sample=False,
            use_cache=False,
        )

    generated_text = processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
    parsed = processor.post_process_generation(
        generated_text, task=task_prompt, image_size=(W, H)
    )

    # Release MPS allocator buffers so Ollama's Metal allocation has
    # contiguous memory available for the next Qwen-VL load. Without
    # this, the unified-memory MPS cache holds Florence's intermediate
    # tensors and Ollama falls back to CPU (compute graph ~35 GiB) and
    # OOMs.
    del inputs, generated_ids, generated_text
    if torch.backends.mps.is_available():
        torch.mps.empty_cache()

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
