"""§3.10 cross_pass_dedup — REAL op.

Within one frame's detections, merge two boxes ``a`` and ``b`` if
**either**:
  1. IoU(a, b) > config.thresholds.crossPassEmbeddingTheta-conjugate
     i.e. IoU > 0.7 AND label_text_compat(primary_label_a,
     primary_label_b) == True; OR
  2. cosine(crop_embedding(a), crop_embedding(b)) >= 0.88 AND
     label_text_compat(...) == True.

Survivor wins by ``len(contributing_signals)`` (more corroborated wins),
tie-break by lexicographically smallest ``detection_id``. The discarded
detection's signals are appended to the survivor's list. Detections
without crop embeddings (omitted from EmbeddedFrame.embeddings)
participate only in the IoU branch.
"""
from __future__ import annotations

import logging
from typing import Optional

import numpy as np

from pipeline_service.models.label_encoder import LabelEncoder, label_text_compat
from pipeline_service.types import (
    BBox,
    ContributingSignal,
    DedupedFrame,
    EmbeddedFrame,
    FusedDetection,
    FusedFrame,
    PipelineConfig,
)

logger = logging.getLogger("pipeline_service.ops.cross_pass_dedup")


def _iou(a: BBox, b: BBox) -> float:
    ax2, ay2 = a.x + a.width, a.y + a.height
    bx2, by2 = b.x + b.width, b.y + b.height
    ix1, iy1 = max(a.x, b.x), max(a.y, b.y)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    union = max(0.0, a.width * a.height) + max(0.0, b.width * b.height) - inter
    return 0.0 if union <= 0 else inter / union


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    norm = float(np.linalg.norm(a) * np.linalg.norm(b))
    if norm == 0:
        return 0.0
    return float(np.dot(a, b) / norm)


def _merge_signals(
    survivor: list[ContributingSignal], discarded: list[ContributingSignal]
) -> list[ContributingSignal]:
    seen: set[tuple] = set()
    out: list[ContributingSignal] = []
    for sig in list(survivor) + list(discarded):
        key = (sig.detector, sig.frameId, sig.rawConfidence)
        if key in seen:
            continue
        seen.add(key)
        out.append(sig)
    out.sort(
        key=lambda s: (
            s.detector,
            s.frameId,
            (1, 0.0) if s.rawConfidence is None else (0, s.rawConfidence),
        )
    )
    return out


def _winner(a: FusedDetection, b: FusedDetection) -> tuple[FusedDetection, FusedDetection]:
    """Return (survivor, discarded). Highest len(contributing_signals) wins;
    tie-break by smaller detection_id (lexicographic)."""
    if len(a.contributing_signals) > len(b.contributing_signals):
        return a, b
    if len(b.contributing_signals) > len(a.contributing_signals):
        return b, a
    return (a, b) if a.detection_id < b.detection_id else (b, a)


def cross_pass_dedup_impl(
    fused_frame: FusedFrame,
    embedded_frame: EmbeddedFrame | dict,
    *,
    encoder: Optional[LabelEncoder] = None,
    config: Optional[PipelineConfig] = None,
) -> DedupedFrame:
    if not fused_frame.fused:
        return DedupedFrame(frame_id=fused_frame.frame_id, detections=[])

    cfg = config or PipelineConfig()
    iou_thr = 0.7  # plan §3.10 — cross_pass IoU threshold (literal, not config)
    cos_thr = cfg.thresholds.crossPassEmbeddingTheta
    label_thr = cfg.thresholds.labelTextCompatTheta
    enc = encoder or LabelEncoder()

    # Resolve embeddings dict (allow EmbeddedFrame OR raw dict for test ergonomics)
    if isinstance(embedded_frame, EmbeddedFrame):
        emb_bytes = embedded_frame.embeddings
    else:
        emb_bytes = dict(embedded_frame)

    embeddings: dict[str, np.ndarray] = {
        det_id: np.frombuffer(b, dtype=np.float16).astype(np.float32)
        for det_id, b in emb_bytes.items()
    }

    # Sort detections lexicographically by id (deterministic processing order)
    survivors: list[FusedDetection] = sorted(
        fused_frame.fused, key=lambda d: d.detection_id
    )

    # Iterative merge until no merges happen.
    changed = True
    while changed and len(survivors) > 1:
        changed = False
        out: list[FusedDetection] = []
        consumed: set[str] = set()
        for i, a in enumerate(survivors):
            if a.detection_id in consumed:
                continue
            merged_into_existing = False
            for b in survivors[i + 1 :]:
                if b.detection_id in consumed:
                    continue
                if not label_text_compat(
                    a.primary_label,
                    b.primary_label,
                    threshold=label_thr,
                    encoder=enc,
                ):
                    continue
                iou = _iou(a.bbox, b.bbox)
                merged = False
                if iou > iou_thr:
                    merged = True
                else:
                    va = embeddings.get(a.detection_id)
                    vb = embeddings.get(b.detection_id)
                    if va is not None and vb is not None and _cosine(va, vb) >= cos_thr:
                        merged = True
                if merged:
                    survivor, discarded = _winner(a, b)
                    survivor = survivor.model_copy(
                        update={
                            "contributing_signals": _merge_signals(
                                survivor.contributing_signals,
                                discarded.contributing_signals,
                            )
                        }
                    )
                    out.append(survivor)
                    consumed.add(a.detection_id)
                    consumed.add(b.detection_id)
                    changed = True
                    merged_into_existing = True
                    break
            if not merged_into_existing and a.detection_id not in consumed:
                out.append(a)
                consumed.add(a.detection_id)
        survivors = sorted(out, key=lambda d: d.detection_id)

    return DedupedFrame(frame_id=fused_frame.frame_id, detections=list(survivors))
