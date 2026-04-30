"""§3.11 cross_frame_dedup — REAL op.

Maintain a per-run in-memory FAISS index. Iterate frame-by-frame, merging
each detection with its nearest neighbour iff:
  1. cosine(crop_embedding) >= config.thresholds.crossFrameEmbeddingTheta (0.85)
  2. label_text_compat(primary_label_a, primary_label_b) == True
  3. The two detections come from different frame_ids.

Same-frame pairs are NEVER merged here (cross_pass_dedup's job).
Detections without crop embeddings are still emitted but skip FAISS lookup.
"""
from __future__ import annotations

import logging
from typing import Optional

import numpy as np

from pipeline_service.models.label_encoder import LabelEncoder, label_text_compat
from pipeline_service.ops._stub import mark_stub  # noqa: F401 — kept for parity
from pipeline_service.storage.faiss_index import FaissIndex
from pipeline_service.types import (
    ContributingSignal,
    DedupedFrame,
    EmbeddedFrame,
    FusedDetection,
    PipelineConfig,
    PipelineDetection,
    SceneObservation,
)

logger = logging.getLogger("pipeline_service.ops.cross_frame_dedup")


def _merge_signals(
    survivor: list[ContributingSignal],
    discarded: list[ContributingSignal],
) -> list[ContributingSignal]:
    seen: set[tuple] = set()
    out: list[ContributingSignal] = []
    for s in list(survivor) + list(discarded):
        key = (s.detector, s.frameId, s.rawConfidence)
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
    out.sort(
        key=lambda s: (
            s.detector,
            s.frameId,
            (1, 0.0) if s.rawConfidence is None else (0, s.rawConfidence),
        )
    )
    return out


def cross_frame_dedup_impl(
    deduped_frames: list[DedupedFrame],
    embedded_frames: list[EmbeddedFrame],
    *,
    scene_id: str = "",
    run_id: str = "",
    encoder: Optional[LabelEncoder] = None,
    config: Optional[PipelineConfig] = None,
) -> SceneObservation:
    if not deduped_frames:
        return SceneObservation.empty(scene_id=scene_id, run_id=run_id, frame_ids=[])

    cfg = config or PipelineConfig()
    cos_thr = cfg.thresholds.crossFrameEmbeddingTheta
    label_thr = cfg.thresholds.labelTextCompatTheta
    enc = encoder or LabelEncoder()

    # Build a per-run FAISS index. Note: FaissIndex is INSTANTIATED inside
    # this function — never persisted across calls (regression test asserts
    # this in section-06's test_cross_frame_dedup.py).
    index = FaissIndex(dim=768)

    # Map frame_id → embedding-bytes-by-detection-id for vector lookup.
    embed_by_frame: dict[str, dict[str, np.ndarray]] = {}
    for ef in embedded_frames:
        embed_by_frame[ef.frame_id] = {
            det_id: np.frombuffer(b, dtype=np.float16).astype(np.float32)
            for det_id, b in ef.embeddings.items()
        }

    sorted_frames = sorted(deduped_frames, key=lambda f: f.frame_id)
    frame_ids = [f.frame_id for f in sorted_frames]

    survivors: dict[str, FusedDetection] = {}
    detection_to_frame: dict[str, str] = {}

    for df in sorted_frames:
        embeds = embed_by_frame.get(df.frame_id, {})
        for det in sorted(df.detections, key=lambda d: d.detection_id):
            vec = embeds.get(det.detection_id)
            if vec is None:
                # embedding-unavailable → emit as a fresh survivor, skip FAISS.
                survivors[det.detection_id] = det
                detection_to_frame[det.detection_id] = df.frame_id
                continue
            hits = index.knn(vec, k=3)
            merged = False
            for hit in hits:
                surv_frame = detection_to_frame.get(hit.detection_id)
                if surv_frame is None or surv_frame == df.frame_id:
                    continue  # same frame — never merge here
                if hit.cosine < cos_thr:
                    continue
                survivor = survivors.get(hit.detection_id)
                if survivor is None:
                    continue
                if not label_text_compat(
                    det.primary_label,
                    survivor.primary_label,
                    threshold=label_thr,
                    encoder=enc,
                ):
                    continue
                # Merge: append discarded signals to survivor; do not add det
                # to the FAISS index.
                survivors[hit.detection_id] = survivor.model_copy(
                    update={
                        "contributing_signals": _merge_signals(
                            survivor.contributing_signals,
                            det.contributing_signals,
                        )
                    }
                )
                merged = True
                break
            if not merged:
                index.extend(det.detection_id, vec)
                survivors[det.detection_id] = det
                detection_to_frame[det.detection_id] = df.frame_id

    final_dets = sorted(
        survivors.values(),
        key=lambda d: (d.primary_label, d.frame_id, d.detection_id),
    )

    # Build SceneObservation with PipelineDetection records hydrated from the
    # cross-frame-deduped FusedDetection list. Section-07's agreement_scoring
    # populates the agreement fields and recomputes ``confidence``; the bbox,
    # primary_label, alternates, and contributing_signals are stable here.
    pipeline_detections = [
        PipelineDetection(
            id=fd.detection_id,
            bbox=fd.bbox,
            primaryLabel=fd.primary_label,
            alternateLabels=[
                {"label": label, "confidence": float(score)}
                for label, score in fd.alternates
            ],
            contributingSignals=fd.contributing_signals,
        )
        for fd in final_dets
    ]
    return SceneObservation.empty(
        scene_id=scene_id, run_id=run_id, frame_ids=frame_ids
    ).model_copy(update={"detections": pipeline_detections})
