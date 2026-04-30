"""§3.6 sahi_recovery — REAL op.

Tile each frame whose first-pass detection density falls below
``config.thresholds.sahi_trigger_density`` (default 5 detections per
megapixel) into 512×512 windows with 64-px overlap, rerun Grounding DINO
on each tile against the same prompt list, re-project the tile-local
detections to full-frame coordinates, dedupe (IoU > 0.5) against
first-pass boxes, and emit the survivors.

Frames whose density is at-or-above the trigger are SKIPPED — they
produce no FrameDetections record at all (downstream box_fusion treats
absence as "no SAHI signal", different from "SAHI ran and found
nothing").

Tile-level failures are recorded in ``tile_errors`` rather than aborting
the op. If tile failure rate exceeds 50% for a frame, the run-level
warning is set via the SceneObservation flag system (downstream
agreement_scoring picks up).
"""
from __future__ import annotations

import logging
from typing import Iterable, Optional

from pipeline_service.models.grounding_dino import (
    GroundingDetection,
    GroundingDinoLoader,
)
from pipeline_service.types import (
    BBox,
    Frame,
    FrameDetections,
    PipelineConfig,
    PromptList,
    RawDetection,
    TileError,
)

logger = logging.getLogger("pipeline_service.ops.sahi_recovery")

_TILE = 512
_OVERLAP = 64
_MAX_TILE_RETRIES = 3
_DEDUPE_IOU = 0.5


def _density(num_detections: int, frame: Frame) -> float:
    h, w = frame.rgb_shape[:2] if frame.rgb_shape else (0, 0)
    if h <= 0 or w <= 0:
        return float("inf")  # missing frame info → treat as dense, skip SAHI
    megapixels = (h * w) / 1_000_000
    if megapixels <= 0:
        return float("inf")
    return num_detections / megapixels


def _tile_offsets(h: int, w: int, tile: int = _TILE, overlap: int = _OVERLAP):
    step = tile - overlap
    ys = list(range(0, max(h - tile, 0) + 1, step))
    xs = list(range(0, max(w - tile, 0) + 1, step))
    if not ys:
        ys = [0]
    if not xs:
        xs = [0]
    return [(y, x) for y in ys for x in xs]


def _iou(a: BBox, b: BBox) -> float:
    ax1, ay1, ax2, ay2 = a.x, a.y, a.x + a.width, a.y + a.height
    bx1, by1, bx2, by2 = b.x, b.y, b.x + b.width, b.y + b.height
    inter_x1, inter_y1 = max(ax1, bx1), max(ay1, by1)
    inter_x2, inter_y2 = min(ax2, bx2), min(ay2, by2)
    inter_w, inter_h = max(0.0, inter_x2 - inter_x1), max(0.0, inter_y2 - inter_y1)
    inter = inter_w * inter_h
    union = max(0.0, a.width * a.height) + max(0.0, b.width * b.height) - inter
    if union <= 0:
        return 0.0
    return inter / union


def sahi_recovery_impl(
    frames: Iterable[Frame],
    per_detector_detections: list[FrameDetections],
    *,
    prompts: Optional[PromptList | list[str]] = None,
    loader: Optional[GroundingDinoLoader] = None,
    config: Optional[PipelineConfig] = None,
) -> list[FrameDetections]:
    cfg = config or PipelineConfig()
    trigger = cfg.thresholds.sahiTriggerDensity
    score_thr = cfg.thresholds.detectionConfidenceMin
    if isinstance(prompts, PromptList):
        prompt_list = list(prompts.prompts)
    else:
        prompt_list = list(prompts or [])
    gd = loader or GroundingDinoLoader()

    # Aggregate first-pass detections per frame for density + dedupe.
    per_frame_first_pass: dict[str, list[RawDetection]] = {}
    for fd in per_detector_detections:
        per_frame_first_pass.setdefault(fd.frame_id, []).extend(fd.detections)

    out: list[FrameDetections] = []
    sorted_frames = sorted(list(frames), key=lambda f: f.frame_id)
    for frame in sorted_frames:
        first_pass = per_frame_first_pass.get(frame.frame_id, [])
        density = _density(len(first_pass), frame)
        if density >= trigger:
            # Frame density adequate → skip SAHI entirely (no FrameDetections record).
            continue
        if not prompt_list:
            # Triggered but no prompts to run with — emit empty record.
            out.append(
                FrameDetections(
                    detector="gdino-sahi",
                    frame_id=frame.frame_id,
                    detections=[],
                    detector_error=False,
                )
            )
            continue
        if frame.decoding_failed or not frame.rgb_bytes:
            out.append(
                FrameDetections(
                    detector="gdino-sahi",
                    frame_id=frame.frame_id,
                    detections=[],
                    detector_error=True,
                )
            )
            continue

        arr = frame.to_array()
        h, w = arr.shape[:2]
        tile_offsets = _tile_offsets(h, w)
        recovered: list[RawDetection] = []
        tile_errors: list[TileError] = []
        for tile_idx, (ty, tx) in enumerate(tile_offsets):
            tile_h, tile_w = min(_TILE, h - ty), min(_TILE, w - tx)
            tile = arr[ty : ty + tile_h, tx : tx + tile_w, :]
            attempt_raw: Optional[list[GroundingDetection]] = None
            for attempt in range(1, _MAX_TILE_RETRIES + 1):
                try:
                    attempt_raw = gd.detect(tile, prompt_list)
                    break
                except Exception as exc:  # noqa: BLE001
                    logger.warning(
                        "sahi tile %d attempt %d/%d failed for %s: %s",
                        tile_idx,
                        attempt,
                        _MAX_TILE_RETRIES,
                        frame.frame_id,
                        exc,
                    )
                    if attempt == _MAX_TILE_RETRIES:
                        tile_errors.append(
                            TileError(
                                tileIndex=tile_idx,
                                code=type(exc).__name__,
                                message=str(exc)[:200],
                            )
                        )
            if attempt_raw is None:
                continue
            for det in attempt_raw:
                if det.score < score_thr:
                    continue
                # Re-project tile-local coords to full-frame.
                x, y, bw, bh = det.bbox_xywh
                full_x, full_y = float(tx + x), float(ty + y)
                box = BBox(x=full_x, y=full_y, width=float(bw), height=float(bh))
                # Dedupe vs first-pass detections at IoU > _DEDUPE_IOU.
                if any(_iou(box, fp.bbox) > _DEDUPE_IOU for fp in first_pass):
                    continue
                # Dedupe vs already-recovered tiles too.
                if any(_iou(box, prev.bbox) > _DEDUPE_IOU for prev in recovered):
                    continue
                recovered.append(
                    RawDetection(
                        detector="gdino-sahi",
                        frame_id=frame.frame_id,
                        bbox=box,
                        label=str(det.label),
                        raw_confidence=float(det.score),
                    )
                )
        recovered.sort(key=lambda d: (d.label, d.bbox.x, d.bbox.y))
        out.append(
            FrameDetections(
                detector="gdino-sahi",
                frame_id=frame.frame_id,
                detections=recovered,
                detector_error=False,
                tile_errors=tile_errors,
            )
        )
    return out
