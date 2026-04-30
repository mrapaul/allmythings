"""§3.12 classification_refine — REAL op (replaces section-01 stub).

Per-detection Qwen-VL tier chain, ported verbatim from the existing
Temporal worker at ``api-service/src/temporal/activities/enrich-item.activity.ts``.
The prompt template + tier order are intentionally unchanged — Phase 3's
job is parity, not improvement.

Tier chain:
    qwen2.5vl:7b → qwen2.5vl:3b → moondream → empty {}

On a tier failure:
  - ``OllamaParseError``     → fall through to next tier (no in-tier retry)
  - ``OllamaTimeout``        → fall through (the client already burnt the
                                tier's per-call budget)
  - ``OllamaServerError``    → fall through

Output: same SceneObservation, with each detection's
``vlmStructuredAttributes`` populated. If every tier failed, the field
is ``{}`` — never a fake "florence-only" default; present-without-
enrichment is OK, lying with a default attribute set is not.

All Ollama calls go through the per-model semaphore in
``models/ollama_client.py``.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from pipeline_service.models.ollama_client import (
    OllamaClient,
    OllamaError,
    OllamaParseError,
    OllamaServerError,
    OllamaTimeout,
)
from pipeline_service.types import (
    Frame,
    PipelineConfig,
    PipelineDetection,
    SceneObservation,
)

logger = logging.getLogger("pipeline_service.ops.classification_refine")

# Verbatim from api-service/src/temporal/activities/enrich-item.activity.ts
# (PROMPT constant). DO NOT edit without an explicit fixture-refresh PR —
# §10/§11 of the cutover plan calls Phase 3 a *parity* phase.
_PROMPT_TEMPLATE = """You are an expert appraiser identifying a single household item in a photo.
Return ONLY a single JSON object with these fields (no markdown, no prose):
{
 "name": "short specific name, e.g. 'Brass desk lamp'",
 "category": "short category, e.g. 'lighting'",
 "color": "dominant color(s)",
 "material": "primary material",
 "condition": "poor|fair|good|excellent",
 "estimated_value": "price range in EUR like '40-60 EUR' or null",
 "description": "one-sentence description",
 "search_tags": ["tag1", "tag2", "..."]
}
The item in question is labeled by a vision detector as: "{CAPTION}\""""

_TIER_TIMEOUTS_S: dict[str, float] = {
    # Match enrich-item.activity.ts::tierTimeoutMs() values.
    "qwen2.5vl:7b": 20.0,
    "qwen2.5vl:3b": 12.0,
    "moondream": 8.0,
}

_DEFAULT_TIER_ORDER: tuple[str, ...] = (
    "qwen2.5vl:7b",
    "qwen2.5vl:3b",
    "moondream",
)

# Map plan-level tier-forcing names to Ollama model strings.
_TIER_FORCING_TO_MODEL = {
    "qwen7b": "qwen2.5vl:7b",
    "qwen3b": "qwen2.5vl:3b",
    "moondream": "moondream",
}


def _tier_chain(forced: Optional[str]) -> tuple[str, ...]:
    if not forced:
        return _DEFAULT_TIER_ORDER
    target = _TIER_FORCING_TO_MODEL.get(forced)
    if target is None:
        return _DEFAULT_TIER_ORDER
    try:
        idx = _DEFAULT_TIER_ORDER.index(target)
    except ValueError:
        return _DEFAULT_TIER_ORDER
    return _DEFAULT_TIER_ORDER[idx:]


async def _run_tier_chain(
    detection: PipelineDetection,
    image_bytes: bytes,
    ollama: OllamaClient,
    tiers: tuple[str, ...],
) -> dict[str, Any]:
    prompt = _PROMPT_TEMPLATE.replace("{CAPTION}", detection.primaryLabel)
    for tier in tiers:
        try:
            attrs = await ollama.generate(
                model=tier,
                prompt=prompt,
                images=[image_bytes],
                format="json",
                timeout_s=_TIER_TIMEOUTS_S.get(tier),
            )
            if isinstance(attrs, dict):
                return attrs
            return {}
        except OllamaParseError:
            logger.info("tier %s parse error; falling through", tier)
            continue
        except OllamaTimeout:
            logger.info("tier %s timeout; falling through", tier)
            continue
        except OllamaServerError:
            logger.info("tier %s server error; falling through", tier)
            continue
        except OllamaError as exc:
            logger.warning("tier %s unexpected ollama error %s; falling through", tier, exc)
            continue
    return {}


def _frame_to_jpeg(frame: Frame) -> bytes:
    """Re-encode a Frame's RGB pixels as JPEG bytes (the format Ollama expects).

    Mirrors enrich-item.activity.ts:55 sending the full image (not the crop)
    — Phase 3 is parity, not improvement; section-04+ may switch to per-bbox
    crops once dedup lands.
    """
    from io import BytesIO

    from PIL import Image
    import numpy as np

    if frame.decoding_failed or not frame.rgb_bytes:
        return b""
    arr = np.frombuffer(frame.rgb_bytes, dtype=frame.rgb_dtype).reshape(
        frame.rgb_shape
    )
    img = Image.fromarray(arr)
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


async def classification_refine_impl(
    observation: SceneObservation,
    *,
    frames: Optional[list[Frame]] = None,
    ollama: Optional[OllamaClient] = None,
    config: Optional[PipelineConfig] = None,
) -> SceneObservation:
    """See plan §3.12. Per-detection Qwen-VL tier chain. Empty detections list
    → return observation unchanged with no Ollama calls.

    ``frames`` is the burst the SceneObservation was built from. The first
    non-failed frame's bytes are sent to Ollama with each detection; this
    mirrors the existing Temporal worker which passed the full image (not a
    per-bbox crop) into Qwen-VL. Section-04 may switch to bbox-cropped
    payloads once dedup is real.
    """
    if not observation.detections:
        return observation
    cfg = config or PipelineConfig()
    client = ollama or OllamaClient()
    tiers = _tier_chain(cfg.classificationTierForcing)

    image_bytes = b""
    if frames:
        for frame in frames:
            if not frame.decoding_failed:
                image_bytes = _frame_to_jpeg(frame)
                break

    new_detections: list[PipelineDetection] = []
    for detection in observation.detections:
        attrs = await _run_tier_chain(detection, image_bytes, client, tiers)
        new_detections.append(
            detection.model_copy(update={"vlmStructuredAttributes": attrs})
        )
        # Redacted log line — full content lives in Dagster asset metadata only.
        logger.info(
            "classification_refine ran",
            extra={
                "_redact": True,
                "attributes": attrs,
                "detection_id": detection.id,
            },
        )

    return observation.model_copy(update={"detections": new_detections})
