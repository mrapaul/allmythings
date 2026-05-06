"""§3.5 grounding_dino_detect — REAL op (replaces section-01 stub).

Runs Grounding DINO 1.5 Edge against each frame using the prompt list
from vlm_prompt_expansion. Filters detections below
``config.thresholds.gdino_score_thr`` (default 0.30).

Per §3.0 + §3.4 parity:
- Detector field is "gdino" on every emitted detection.
- Per-frame retry 3× on transient backend failure; final failure → emit
  ``FrameDetections(detector_error=True, detections=[])`` for that frame.
  Other frames continue.
- Empty prompts → ``FrameDetections(detections=[], detector_error=False)``
  per frame (no error; the run carries on with Florence-only signal).
- Output sorted ``(label, x, y)`` deterministically per frame.
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
)

logger = logging.getLogger("pipeline_service.ops.grounding_dino_detect")

_MAX_RETRIES = 3


def _detector_error(frame_id: str) -> FrameDetections:
    return FrameDetections(
        detector="gdino",
        frame_id=frame_id,
        detections=[],
        detector_error=True,
    )


def _detect_one(
    loader: GroundingDinoLoader,
    frame: Frame,
    prompts: list[str],
    score_thr: float,
) -> FrameDetections:
    if not prompts:
        return FrameDetections(
            detector="gdino",
            frame_id=frame.frame_id,
            detections=[],
            detector_error=False,
        )
    if frame.decoding_failed or not frame.rgb_bytes:
        return _detector_error(frame.frame_id)
    arr = frame.to_array()

    raw: Optional[list[GroundingDetection]] = None
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            raw = loader.detect(arr, prompts)
            break
        except Exception as exc:  # noqa: BLE001 — backend failure is generic
            logger.warning(
                "gdino backend attempt %d/%d failed for %s: %s",
                attempt,
                _MAX_RETRIES,
                frame.frame_id,
                exc,
            )
            if attempt == _MAX_RETRIES:
                return _detector_error(frame.frame_id)

    if raw is None:
        return _detector_error(frame.frame_id)

    filtered: list[RawDetection] = []
    for det in raw:
        if det.score < score_thr:
            continue
        x, y, w, h = det.bbox_xywh
        filtered.append(
            RawDetection(
                detector="gdino",
                frame_id=frame.frame_id,
                bbox=BBox(x=float(x), y=float(y), width=float(w), height=float(h)),
                label=str(det.label),
                raw_confidence=float(det.score),
            )
        )
    filtered.sort(key=lambda d: (d.label, d.bbox.x, d.bbox.y))
    return FrameDetections(
        detector="gdino",
        frame_id=frame.frame_id,
        detections=filtered,
        detector_error=False,
    )


def grounding_dino_detect_impl(
    frames: Iterable[Frame],
    prompts: PromptList | list[str],
    *,
    loader: Optional[GroundingDinoLoader] = None,
    config: Optional[PipelineConfig] = None,
) -> list[FrameDetections]:
    sorted_frames = sorted(list(frames), key=lambda f: f.frame_id)
    prompt_list: list[str]
    if isinstance(prompts, PromptList):
        prompt_list = list(prompts.prompts)
    else:
        prompt_list = list(prompts or [])

    # Eval/CI mode: short-circuit when no explicit loader was wired AND
    # EVAL_MOCK_BACKENDS=1 is set. Bypasses GPU model load entirely.
    from pipeline_service.ops._synthetic import is_mock_mode, synthetic_frame_detections
    if loader is None and is_mock_mode():
        return synthetic_frame_detections("gdino", sorted_frames)

    cfg = config or PipelineConfig()
    score_thr = cfg.thresholds.detectionConfidenceMin
    gd = loader or GroundingDinoLoader()

    return [
        _detect_one(gd, frame, prompt_list, score_thr)
        for frame in sorted_frames
    ]
