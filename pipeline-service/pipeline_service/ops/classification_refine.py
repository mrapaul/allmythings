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

UX-budget trim (May 2026): the dedup ops upstream produce O(15)
detections per scene on a 3-frame burst because crop_embedding is still
the deterministic-fake DINOv2 (real model is queued for the next
turn). Running Qwen-VL serially across 15 detections is ~75s — far
above the 30s mobile UX budget. Two mitigations live here until
real DINOv2 lands:

  * ``CLASSIFICATION_TOP_K`` env (default 5) caps the number of
    detections sent through Qwen-VL — others get an empty
    ``vlmStructuredAttributes={}`` (same shape as a tier failure).
    Selection is by ``agreementScore`` desc, then by max
    ``rawConfidence`` of the contributing signals desc, then
    lexicographic ``id``.
  * Per-detection tier chains run in parallel via ``asyncio.gather``
    so Ollama's HTTP queue can pipeline them. The per-model
    semaphore in ollama_client serialises model calls; with the
    qwen7b → qwen3b → moondream tier chain, gather still helps
    because tier-2/tier-3 fallbacks for one detection can overlap
    with tier-1 of another.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Optional

from pipeline_service.models.ollama_client import (
    OllamaClient,
    OllamaError,
    OllamaParseError,
    OllamaServerError,
    OllamaTimeout,
)
from pipeline_service.types import (
    AlternateLabel,
    Frame,
    PipelineConfig,
    PipelineDetection,
    SceneObservation,
)

logger = logging.getLogger("pipeline_service.ops.classification_refine")

# Per-detection prompt. The image we send is the BBOX CROP (with a
# small context pad) — Qwen-VL identifies the item independently
# rather than parroting the upstream Florence caption (which is often
# verbose like "living room with gray sofa and blue blanket").
#
# We deliberately do NOT mention the upstream caption in the prompt —
# that biases Qwen-VL to repeat the caption verbatim instead of
# identifying what it actually sees in the crop. The prior verbatim
# prompt (which DID quote the caption) is preserved at the bottom of
# this file as `_PROMPT_TEMPLATE_LEGACY` for the parity tests.
_PROMPT_TEMPLATE = """You are an expert appraiser identifying a single household item in a photo.
Return ONLY a single JSON object with these fields (no markdown, no prose):
{
 "type": "bare object type, lowercase, no adjectives, e.g. 'coffee table' or 'lamp' or 'pillow'",
 "name": "descriptive name with key modifiers, e.g. 'Brass desk lamp' or 'Marble coffee table'",
 "category": "short category, e.g. 'lighting' or 'furniture'",
 "color": "dominant color(s)",
 "material": "primary material",
 "condition": "poor|fair|good|excellent",
 "estimated_value": "price range in EUR like '40-60 EUR' or null",
 "description": "one-sentence description",
 "search_tags": ["tag1", "tag2", "..."]
}
The "type" field is the bare object class — what users will see at the top
of each card. The "name" field is the descriptive variant for search.
Identify the single most prominent household item in the photo. If
multiple items appear, choose the one closest to the center."""

# Legacy prompt — kept for the parity test in
# tests/unit/ops/test_classification_refine.py which asserts the
# original Temporal worker contract. Prepended to {CAPTION} via
# `.replace("{CAPTION}", ...)` by callers that want the legacy shape.
_PROMPT_TEMPLATE_LEGACY = _PROMPT_TEMPLATE + (
    "\nThe item in question is labeled by a vision detector as: "
    "\"{CAPTION}\""
)

_TIER_TIMEOUTS_S: dict[str, float] = {
    # Match enrich-item.activity.ts::tierTimeoutMs() values.
    "qwen2.5vl:7b": 20.0,
    "qwen2.5vl:3b": 12.0,
    "moondream": 8.0,
}

_DEFAULT_TIER_ORDER: tuple[str, ...] = (
    # 3B first: empirically reliable on a stack that already has
    # Florence-2-large + Grounding-DINO-tiny on MPS. The 7B compute
    # graph spills to CPU under that pressure (~35 GiB) and the runner
    # OOMs. 3B fits in MPS in ~3 GB and produces structured JSON
    # comparable to 7B for short attribute extraction. 7B is kept as
    # a fallback for cases where 3B parses incorrectly; moondream
    # remains the final tier for parity with the legacy worker.
    "qwen2.5vl:3b",
    "qwen2.5vl:7b",
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
    # Use the legacy prompt (which quotes the upstream caption) ONLY
    # when no real crop bytes are available — falling back to the full
    # frame loses bbox precision so the caption hint becomes useful
    # disambiguation. With a real crop, the unconditioned
    # ``_PROMPT_TEMPLATE`` lets Qwen-VL identify the item from pixels.
    prompt = _PROMPT_TEMPLATE if image_bytes else _PROMPT_TEMPLATE_LEGACY.replace(
        "{CAPTION}", detection.primaryLabel
    )
    for tier in tiers:
        try:
            attrs = await ollama.generate(
                model=tier,
                prompt=prompt,
                images=[image_bytes],
                format="json",
                timeout_s=_TIER_TIMEOUTS_S.get(tier),
                # 60s window keeps the VLM hot during the burst's
                # asyncio.gather (per-model semaphore serialises calls
                # to the same tier), then auto-unloads when idle so the
                # next pipeline stage doesn't fight for MPS.
                keep_alive="60s",
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
    """Re-encode a Frame's RGB pixels as JPEG bytes."""
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


# Crop padding (fraction of bbox size) — keeps a little surrounding
# context so Qwen-VL can still see the object's setting (e.g. "lamp on
# a table" reads better than a tightly cropped lamp shade in isolation).
_CROP_PAD_FRAC = 0.15


def _crop_for_detection(
    frame: Frame, detection: PipelineDetection
) -> bytes:
    """Crop the detection's bbox out of the frame (with a small context
    pad) and return JPEG bytes. Falls back to the full frame if the
    bbox is degenerate or the crop ends up empty — Qwen-VL classifying
    the whole scene is better than failing classification entirely.
    """
    from io import BytesIO

    from PIL import Image
    import numpy as np

    if frame.decoding_failed or not frame.rgb_bytes:
        return b""
    arr = np.frombuffer(frame.rgb_bytes, dtype=frame.rgb_dtype).reshape(
        frame.rgb_shape
    )
    h, w = arr.shape[:2]

    bbox = detection.bbox
    pad_w = bbox.width * _CROP_PAD_FRAC
    pad_h = bbox.height * _CROP_PAD_FRAC
    x1 = max(0, int(bbox.x - pad_w))
    y1 = max(0, int(bbox.y - pad_h))
    x2 = min(w, int(bbox.x + bbox.width + pad_w))
    y2 = min(h, int(bbox.y + bbox.height + pad_h))
    if x2 <= x1 or y2 <= y1:
        return _frame_to_jpeg(frame)

    crop = arr[y1:y2, x1:x2, :]
    img = Image.fromarray(crop)
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _detection_priority_key(d: PipelineDetection) -> tuple[float, float, str]:
    """Sort key: higher agreementScore first, then highest raw confidence
    among contributing signals, then lexicographic id for determinism.
    Returns negated values where higher should sort first."""
    max_conf = 0.0
    for sig in d.contributingSignals:
        if sig.rawConfidence is not None and sig.rawConfidence > max_conf:
            max_conf = sig.rawConfidence
    return (-float(d.agreementScore or 0.0), -max_conf, d.id)


def _top_k_limit() -> int:
    """Read CLASSIFICATION_TOP_K from env. Defaults to 8; <=0 means no cap.

    Eight is the sweet spot for the M4 Pro 48GB stack:
      * `asyncio.gather` overlaps tier-2/3 fallbacks across detections
        but the per-model semaphore in ollama_client serialises calls
        to qwen2.5vl:7b, so wall-clock ≈ k × ~2-3s for k≤10.
      * Empirically the typical scene has 3-8 distinct items after
        cross-pass dedup; cap at 8 keeps the long-tail of duplicate
        detections out of the Qwen-VL queue without dropping real
        items.
    """
    raw = os.environ.get("CLASSIFICATION_TOP_K", "8")
    try:
        v = int(raw)
        return v if v > 0 else 0
    except ValueError:
        return 8


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

    # Pick the first non-failed frame as the source for per-bbox crops.
    source_frame: Optional[Frame] = None
    if frames:
        for frame in frames:
            if not frame.decoding_failed:
                source_frame = frame
                break

    # Pick top-K detections to actually classify; the rest get
    # vlmStructuredAttributes={} (same shape as a tier failure).
    top_k = _top_k_limit()
    sorted_dets = sorted(observation.detections, key=_detection_priority_key)
    if top_k > 0 and len(sorted_dets) > top_k:
        classify_set = sorted_dets[:top_k]
        skip_set = sorted_dets[top_k:]
        logger.info(
            "classification_refine top-K cap: classifying %d of %d detections",
            top_k,
            len(sorted_dets),
        )
    else:
        classify_set = sorted_dets
        skip_set = []

    # Build per-detection crops so Qwen-VL sees only the object the
    # detector flagged, not the whole scene. This is the difference
    # between "every detection gets the same answer" and per-item
    # classifications. Falls back to the full frame if cropping fails.
    fallback_full = _frame_to_jpeg(source_frame) if source_frame is not None else b""
    crop_bytes_per_det: list[bytes] = []
    for det in classify_set:
        if source_frame is None:
            crop_bytes_per_det.append(b"")
            continue
        try:
            crop = _crop_for_detection(source_frame, det)
            crop_bytes_per_det.append(crop or fallback_full)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "classification_refine crop failed for %s: %s; using full frame",
                det.id,
                exc,
            )
            crop_bytes_per_det.append(fallback_full)

    # Run tier chains concurrently. The per-model semaphore in
    # ollama_client.py serialises calls TO THE SAME MODEL; gather still
    # helps because (a) HTTP/connection setup overlaps with model
    # generation on later tasks, and (b) one detection's qwen3b
    # fallback can overlap with another detection's qwen7b primary.
    attr_results: list[dict[str, Any]] = await asyncio.gather(
        *[
            _run_tier_chain(det, crop_bytes, client, tiers)
            for det, crop_bytes in zip(classify_set, crop_bytes_per_det)
        ]
    )

    classified_ids: dict[str, dict[str, Any]] = {
        det.id: attrs for det, attrs in zip(classify_set, attr_results)
    }
    for det in skip_set:
        classified_ids[det.id] = {}

    new_detections: list[PipelineDetection] = []
    for detection in observation.detections:
        attrs = classified_ids.get(detection.id, {})
        update: dict[str, Any] = {"vlmStructuredAttributes": attrs}
        if attrs:
            promoted_label = _promoted_primary_label(attrs)
            if promoted_label and promoted_label != detection.primaryLabel:
                update["primaryLabel"] = promoted_label
            search_alternates = _build_alternate_labels(
                attrs, primary_label=promoted_label or detection.primaryLabel
            )
            if search_alternates:
                update["alternateLabels"] = search_alternates
        new_detections.append(detection.model_copy(update=update))
        logger.info(
            "classification_refine ran",
            extra={
                "_redact": True,
                "attributes": attrs,
                "detection_id": detection.id,
            },
        )

    deduped = _dedupe_by_type(new_detections)
    if len(deduped) != len(new_detections):
        logger.info(
            "classification_refine post-dedup: %d → %d detections (same-type IoU≥%.2f merge)",
            len(new_detections),
            len(deduped),
            _POST_CLASSIFY_DEDUP_IOU,
        )
    return observation.model_copy(update={"detections": deduped})


# Confidence floors for VLM-derived alternate labels. These are not model
# probabilities (Qwen-VL doesn't emit calibrated scores via JSON-mode); they
# encode our prior on each attribute's *searchability quality*.
_ALT_CONFIDENCE = {
    "name": 0.90,         # the rich descriptive name ("Marble coffee table")
    "category": 0.85,     # high-level group ("furniture")
    "color": 0.80,
    "material": 0.80,
    "search_tag": 0.70,
}

# IoU threshold used by the post-classification dedup. We deliberately
# keep this looser than cross_pass_dedup's 0.7 because once Qwen-VL has
# normalised labels to bare types, two boxes claiming "coffee table" with
# meaningful overlap are almost always the same physical object framed
# slightly differently by Florence vs Grounding DINO vs SAHI tile.
_POST_CLASSIFY_DEDUP_IOU = 0.5

# Containment threshold: merge two same-type boxes when the smaller is
# mostly *inside* the larger (intersection / min_area). This catches the
# common case where Grounding DINO emits an oversized box covering ~the
# whole scene and Qwen-VL labels its contents the same as a tighter
# Florence/SAHI box — IoU stays low because the area ratio is wild, but
# containment is ≥ 0.95 and the two are clearly the same object.
_POST_CLASSIFY_DEDUP_CONTAINMENT = 0.7


def _promoted_primary_label(attrs: dict[str, Any]) -> Optional[str]:
    """Return the user-facing ``primaryLabel`` from a VLM attrs dict.

    Prefer the bare ``type`` ("coffee table", "lamp"); fall back to the
    descriptive ``name`` ("Marble coffee table") only if ``type`` is
    missing or blank. Surfacing the bare type at the top makes scrolling
    a long inventory list scannable AND makes downstream dedup work — two
    boxes both labelled "coffee table" can collapse, where "Marble coffee
    table" vs "Round marble table" wouldn't.
    """
    for key in ("type", "name"):
        val = attrs.get(key)
        if isinstance(val, str):
            cleaned = val.strip()
            if cleaned:
                return cleaned
    return None


def _build_alternate_labels(
    attrs: dict[str, Any], *, primary_label: str
) -> list[AlternateLabel]:
    """Materialise searchable secondary labels from the VLM JSON.

    Mobile search hits ``primaryLabel`` plus every ``alternateLabels[].label``,
    so populating these with the descriptive ``name``, plus ``category``,
    ``color``, ``material`` and the ``search_tags`` array, makes the same
    item findable by attribute searches like "marble" or "blue" — the
    original ask.

    De-duplicates against ``primary_label`` (case-insensitive) so the
    promoted type doesn't appear twice.
    """
    out: list[AlternateLabel] = []
    seen: set[str] = {primary_label.casefold()} if primary_label else set()

    def _push(value: Any, conf: float) -> None:
        if not isinstance(value, str):
            return
        v = value.strip()
        if not v:
            return
        key = v.casefold()
        if key in seen:
            return
        seen.add(key)
        out.append(AlternateLabel(label=v, confidence=conf))

    # Order matters: name is the most descriptive single string after the
    # type, so it leads the alternates list. Then high-level → specific.
    _push(attrs.get("name"), _ALT_CONFIDENCE["name"])
    _push(attrs.get("category"), _ALT_CONFIDENCE["category"])
    _push(attrs.get("color"), _ALT_CONFIDENCE["color"])
    _push(attrs.get("material"), _ALT_CONFIDENCE["material"])

    raw_tags = attrs.get("search_tags")
    if isinstance(raw_tags, list):
        for tag in raw_tags:
            _push(tag, _ALT_CONFIDENCE["search_tag"])
    return out


def _bbox_iou(a: Any, b: Any) -> float:
    ax2, ay2 = a.x + a.width, a.y + a.height
    bx2, by2 = b.x + b.width, b.y + b.height
    ix1, iy1 = max(a.x, b.x), max(a.y, b.y)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    union = max(0.0, a.width * a.height) + max(0.0, b.width * b.height) - inter
    return 0.0 if union <= 0 else inter / union


def _bbox_containment(a: Any, b: Any) -> float:
    """Fraction of the smaller bbox that sits inside the other.

    Returns ``intersection / min(area_a, area_b)`` — 1.0 means the
    smaller box is entirely inside the larger, 0.0 means no overlap.
    Useful when one detector emits a tight crop and another emits a
    much-larger envelope of the same object: IoU stays small because
    the area ratio is extreme, but containment hits ≥ 0.95.
    """
    ax2, ay2 = a.x + a.width, a.y + a.height
    bx2, by2 = b.x + b.width, b.y + b.height
    ix1, iy1 = max(a.x, b.x), max(a.y, b.y)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    smaller = min(a.width * a.height, b.width * b.height)
    return 0.0 if smaller <= 0 else inter / smaller


def _dedupe_by_type(
    detections: list[PipelineDetection],
) -> list[PipelineDetection]:
    """Merge detections sharing the same ``primaryLabel`` (case-insensitive)
    when their bboxes overlap by IoU ≥ 0.5.

    cross_pass_dedup runs *before* Qwen-VL classification, so it sees
    noisy raw labels ("marble coffee table", "round marble table") and
    can't merge them. After classification each detection has a clean
    bare type ("coffee table"), and same-type-overlapping boxes are
    almost always the same object captured by florence + gdino +
    gdino-sahi independently — collapse them.

    Survivor selection (per group):
      1. Most ``contributingSignals`` (more corroboration wins).
      2. Largest bbox area (a tighter crop is usually a partial view).
      3. Lexicographic ``id`` (stability for replay tests).

    Loser detections donate their ``contributingSignals`` and
    ``alternateLabels`` to the survivor (deduped). vlmStructuredAttributes
    stays the survivor's — those are tied to the chosen bbox crop.
    """
    if not detections:
        return detections

    by_type: dict[str, list[PipelineDetection]] = {}
    for det in detections:
        key = (det.primaryLabel or "").casefold().strip()
        by_type.setdefault(key, []).append(det)

    merged_detections: list[PipelineDetection] = []
    for type_key, group in by_type.items():
        if len(group) == 1 or not type_key:
            merged_detections.extend(group)
            continue

        # Sort: most signals desc, then largest area desc, then id asc.
        ranked = sorted(
            group,
            key=lambda d: (
                -len(d.contributingSignals),
                -(d.bbox.width * d.bbox.height),
                d.id,
            ),
        )

        clusters: list[PipelineDetection] = []
        for det in ranked:
            absorbed = False
            for i, surv in enumerate(clusters):
                iou = _bbox_iou(det.bbox, surv.bbox)
                contained = _bbox_containment(det.bbox, surv.bbox)
                if iou < _POST_CLASSIFY_DEDUP_IOU and contained < _POST_CLASSIFY_DEDUP_CONTAINMENT:
                    continue
                # Union signals.
                sig_keys = {
                    (s.detector, s.frameId, s.rawConfidence) for s in surv.contributingSignals
                }
                new_signals = list(surv.contributingSignals)
                for s in det.contributingSignals:
                    k = (s.detector, s.frameId, s.rawConfidence)
                    if k not in sig_keys:
                        sig_keys.add(k)
                        new_signals.append(s)
                # Union alternateLabels (case-insensitive on .label).
                alt_keys = {a.label.casefold() for a in surv.alternateLabels}
                alt_keys.add(surv.primaryLabel.casefold())
                new_alts = list(surv.alternateLabels)
                for a in det.alternateLabels:
                    if a.label.casefold() not in alt_keys:
                        alt_keys.add(a.label.casefold())
                        new_alts.append(a)
                clusters[i] = surv.model_copy(
                    update={
                        "contributingSignals": new_signals,
                        "alternateLabels": new_alts,
                    }
                )
                absorbed = True
                break
            if not absorbed:
                clusters.append(det)
        merged_detections.extend(clusters)
    return merged_detections
