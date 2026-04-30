"""§3.8 box_fusion — REAL op.

Weighted Boxes Fusion (WBF) per frame across all detectors. Hyperparameters
from ``PipelineConfig.boxFusion``: ``iouThr=0.5``, ``skipBoxThr=0.0``,
``detectorWeights={florence:0.5, gdino:1.0, gdino-sahi:0.8}``.

We implement WBF directly (no external lib) so the cluster behaviour is
deterministic and fixture-friendly. The math:
  1. Gather all per-detector boxes for a frame, sorted by
     ``(detector, frame_id, label, x, y)``.
  2. Walk the boxes in sorted order. For each, look for an existing
     cluster whose center IoU >= iouThr; if found, attach to it. Otherwise
     start a new cluster.
  3. Per cluster: weighted-avg of bbox coords (weight = detector_weight ·
     score). The label with the highest weighted score is ``primary_label``;
     all other labels become ``alternates``.
  4. ``contributing_signals`` accumulates every (detector, frame_id,
     raw_confidence) tuple — never drops.
"""
from __future__ import annotations

import logging
import uuid
from typing import Optional

from pipeline_service.types import (
    BBox,
    ContributingSignal,
    FrameDetections,
    FusedDetection,
    FusedFrame,
    PipelineConfig,
    RawDetection,
)

logger = logging.getLogger("pipeline_service.ops.box_fusion")

# Florence has no real confidence — it's treated as 0.5 for WBF weighting,
# but the recorded ContributingSignal.rawConfidence stays None so downstream
# agreement_scoring sees explicit absence.
_FLORENCE_DEFAULT_CONF = 0.5


def _iou(a: BBox, b: BBox) -> float:
    ax2, ay2 = a.x + a.width, a.y + a.height
    bx2, by2 = b.x + b.width, b.y + b.height
    ix1, iy1 = max(a.x, b.x), max(a.y, b.y)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    union = max(0.0, a.width * a.height) + max(0.0, b.width * b.height) - inter
    return 0.0 if union <= 0 else inter / union


class _Cluster:
    __slots__ = ("contributors",)

    def __init__(self) -> None:
        # list of (det, weighted_conf, label_score)
        self.contributors: list[tuple[RawDetection, float]] = []

    def add(self, det: RawDetection, weighted_conf: float) -> None:
        self.contributors.append((det, weighted_conf))

    def representative_bbox(self) -> BBox:
        # Weighted average of corners.
        total_w = sum(w for _, w in self.contributors)
        if total_w == 0:
            return self.contributors[0][0].bbox
        x = sum(d.bbox.x * w for d, w in self.contributors) / total_w
        y = sum(d.bbox.y * w for d, w in self.contributors) / total_w
        bw = sum(d.bbox.width * w for d, w in self.contributors) / total_w
        bh = sum(d.bbox.height * w for d, w in self.contributors) / total_w
        return BBox(x=x, y=y, width=bw, height=bh)

    def label_breakdown(self) -> tuple[str, list[tuple[str, float]]]:
        """Return (primary_label, alternates) by weighted score.

        Tie-break: lexicographic label order so output is byte-deterministic.
        """
        scores: dict[str, float] = {}
        for det, w in self.contributors:
            scores[det.label] = scores.get(det.label, 0.0) + w
        ranked = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))
        primary = ranked[0][0]
        alternates = [(label, round(score, 6)) for label, score in ranked[1:]]
        return primary, alternates

    def signals(self) -> list[ContributingSignal]:
        out = [
            ContributingSignal(
                detector=det.detector,
                frameId=det.frame_id,
                rawConfidence=det.raw_confidence,
            )
            for det, _ in self.contributors
        ]
        # Stable order: (detector, frameId, rawConfidence-with-None-last, label).
        out.sort(
            key=lambda s: (
                s.detector,
                s.frameId,
                (1, 0.0) if s.rawConfidence is None else (0, s.rawConfidence),
            )
        )
        return out


def _box_fusion_for_frame(
    frame_id: str,
    detections: list[RawDetection],
    iou_thr: float,
    detector_weights: dict[str, float],
) -> FusedFrame:
    if not detections:
        return FusedFrame(frame_id=frame_id, fused=[])

    # Determinism: sort by (detector, frame_id, label, x, y).
    sorted_dets = sorted(
        detections,
        key=lambda d: (d.detector, d.frame_id, d.label, d.bbox.x, d.bbox.y),
    )

    clusters: list[_Cluster] = []
    for det in sorted_dets:
        weight = detector_weights.get(det.detector, 1.0)
        conf = det.raw_confidence if det.raw_confidence is not None else _FLORENCE_DEFAULT_CONF
        weighted = weight * conf
        # Find an existing cluster whose representative box has IoU >= iou_thr.
        attached = False
        for cluster in clusters:
            rep = cluster.representative_bbox()
            if _iou(rep, det.bbox) >= iou_thr:
                cluster.add(det, weighted)
                attached = True
                break
        if not attached:
            new = _Cluster()
            new.add(det, weighted)
            clusters.append(new)

    fused: list[FusedDetection] = []
    for cluster in clusters:
        primary, alternates = cluster.label_breakdown()
        fused.append(
            FusedDetection(
                detection_id=str(_deterministic_uuid(cluster, frame_id, primary)),
                frame_id=frame_id,
                bbox=cluster.representative_bbox(),
                primary_label=primary,
                alternates=alternates,
                contributing_signals=cluster.signals(),
            )
        )
    fused.sort(key=lambda fd: (fd.primary_label, fd.bbox.x, fd.bbox.y))
    return FusedFrame(frame_id=frame_id, fused=fused)


def _deterministic_uuid(cluster: _Cluster, frame_id: str, primary: str) -> uuid.UUID:
    """Stable UUID for replay-test determinism: hash(frame, primary, sorted contributors)."""
    parts = [frame_id, primary]
    for det, _ in sorted(
        cluster.contributors,
        key=lambda c: (c[0].detector, c[0].frame_id, c[0].label, c[0].bbox.x, c[0].bbox.y),
    ):
        parts.append(
            f"{det.detector}:{det.frame_id}:{det.label}:{det.bbox.x:.4f}:{det.bbox.y:.4f}"
        )
    return uuid.uuid5(uuid.NAMESPACE_OID, "|".join(parts))


def box_fusion_impl(
    per_detector_detections: list[FrameDetections],
    *,
    config: Optional[PipelineConfig] = None,
) -> list[FusedFrame]:
    """See plan §3.8. Empty input → []."""
    cfg = config or PipelineConfig()
    iou_thr = cfg.boxFusion.iouThr
    weights_obj = cfg.boxFusion.detectorWeights
    detector_weights = {
        "florence": weights_obj.florence,
        "gdino": weights_obj.gdino,
        "gdino-sahi": weights_obj.gdino_sahi,
    }

    if not per_detector_detections:
        return []

    by_frame: dict[str, list[RawDetection]] = {}
    for fd in per_detector_detections:
        by_frame.setdefault(fd.frame_id, [])
        for det in fd.detections:
            by_frame[fd.frame_id].append(det)

    return [
        _box_fusion_for_frame(frame_id, dets, iou_thr, detector_weights)
        for frame_id, dets in sorted(by_frame.items(), key=lambda kv: kv[0])
    ]
