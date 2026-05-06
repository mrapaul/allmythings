"""Synthetic backend outputs for CI / ``EVAL_MOCK_BACKENDS=1`` mode.

Emits deterministic detections per frame so the eval gate (agreement
coverage, dedup precision, op failure rate) can pass without needing a
real Florence-2 / Grounding DINO / Qwen-VL / EffSAM HTTP backend
running.

Outputs are tagged by virtue of using a fixed label namespace
(``synthetic_*``) — observability dashboards can split synthetic vs real
runs by label-prefix without needing a separate ``signal`` field on
RawDetection.

Determinism: same input ⇒ byte-equal output across runs. Detections
are sorted by ``(label, x, y)`` per the contract in §3.4.
"""
from __future__ import annotations

import os
from typing import Iterable

from pipeline_service.types import (
    BBox,
    Frame,
    FrameDetections,
    RawDetection,
)


def is_mock_mode() -> bool:
    """True when the eval harness has flipped on ``EVAL_MOCK_BACKENDS=1``."""
    return os.environ.get("EVAL_MOCK_BACKENDS") == "1"


# A small shared label set so florence + gdino agree on the same items.
# Three labels per frame is enough to satisfy the agreement gate
# (≥0.70 coverage) without making the pipeline trivially noiseless.
_SYNTHETIC_LABELS: list[tuple[str, BBox]] = [
    ("synthetic_chair", BBox(x=0.10, y=0.10, width=0.20, height=0.40)),
    ("synthetic_lamp", BBox(x=0.55, y=0.05, width=0.15, height=0.30)),
    ("synthetic_book", BBox(x=0.30, y=0.55, width=0.10, height=0.10)),
]


def synthetic_frame_detections(
    detector: str,
    frames: Iterable[Frame],
) -> list[FrameDetections]:
    """Return deterministic FrameDetections for ``detector`` over ``frames``.

    The same label/bbox set is emitted for every frame so cross-frame
    dedup and cross-detector agreement both succeed cleanly.
    """
    out: list[FrameDetections] = []
    for frame in sorted(frames, key=lambda f: f.frame_id):
        detections = [
            RawDetection(
                detector=detector,
                frame_id=frame.frame_id,
                bbox=bbox,
                label=label,
                # gdino real path provides confidence; florence path leaves it None.
                # Mirror that here so downstream code paths see the same shape.
                raw_confidence=0.85 if detector == "gdino" else None,
            )
            for label, bbox in _SYNTHETIC_LABELS
        ]
        detections.sort(key=lambda d: (d.label, d.bbox.x, d.bbox.y))
        out.append(
            FrameDetections(
                detector=detector,
                frame_id=frame.frame_id,
                detections=detections,
                detector_error=False,
            )
        )
    return out
