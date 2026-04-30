"""§3.7 effsam_segment — REAL op.

Run EfficientSAM-Ti on each fused box, return RLE-encoded masks.
Per-box mask IoU < 0.4 with the input bbox → mask dropped (likely
occlusion bleed). Per-box failure → that box has no mask but the op
continues. EfficientSAM unavailable (loader raises consistently) →
op succeeds with an empty list (downstream crop_embedding falls back
to bbox crops).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Iterable, Optional

from pipeline_service.models.effsam import (
    EffSAMLoader,
    encode_rle,
    mask_iou_with_bbox,
)
from pipeline_service.types import Frame, FusedFrame, PipelineConfig

logger = logging.getLogger("pipeline_service.ops.effsam_segment")


@dataclass
class Mask:
    """RLE-encoded mask carrying its source detection_id + frame_id.

    Section-06 attaches these onto the FusedDetection it surfaces; for now
    section-05 emits them as a side-channel list that section-06 can fold
    in.
    """

    detection_id: str
    frame_id: str
    rle_bytes: bytes


def effsam_segment_impl(
    frames: Iterable[Frame],
    fused_frames: list[FusedFrame],
    *,
    loader: Optional[EffSAMLoader] = None,
    config: Optional[PipelineConfig] = None,
) -> list[Mask]:
    cfg = config or PipelineConfig()
    iou_drop_threshold = 0.4
    eff = loader or EffSAMLoader()
    by_frame_id = {fr.frame_id: fr for fr in frames}

    out: list[Mask] = []
    for ff in sorted(fused_frames, key=lambda f: f.frame_id):
        if not ff.fused:
            continue
        frame = by_frame_id.get(ff.frame_id)
        if frame is None or frame.decoding_failed:
            continue
        arr = frame.to_array()
        bboxes = [
            (det.bbox.x, det.bbox.y, det.bbox.width, det.bbox.height)
            for det in sorted(ff.fused, key=lambda d: d.detection_id)
        ]
        try:
            masks = eff.segment(arr, bboxes)
        except Exception as exc:  # noqa: BLE001
            logger.warning("effsam unavailable for %s: %s", ff.frame_id, exc)
            continue

        sorted_dets = sorted(ff.fused, key=lambda d: d.detection_id)
        for det, mask in zip(sorted_dets, masks):
            if mask is None or mask.size == 0:
                continue
            iou = mask_iou_with_bbox(
                mask,
                (det.bbox.x, det.bbox.y, det.bbox.width, det.bbox.height),
            )
            if iou < iou_drop_threshold:
                continue
            out.append(
                Mask(
                    detection_id=det.detection_id,
                    frame_id=ff.frame_id,
                    rle_bytes=encode_rle(mask),
                )
            )
    return out
