"""§3.6 sahi_recovery — section-01 stub.

Stub returns no extra FrameDetections (no triggered frames). Real impl
in section-05 evaluates ``config.thresholds.sahi_trigger_density`` per
frame and tiles low-density frames.
"""
from __future__ import annotations

from pipeline_service.ops._stub import mark_stub
from pipeline_service.types import Frame, FrameDetections


@mark_stub
def sahi_recovery_impl(
    frames: list[Frame],
    per_detector_detections: list[FrameDetections],
) -> list[FrameDetections]:
    return []
