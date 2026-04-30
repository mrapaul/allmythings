"""§3.4 florence_detect — section-01 stub. Real impl in section-03."""
from __future__ import annotations

from pipeline_service.ops._stub import mark_stub
from pipeline_service.types import Frame, FrameDetections


@mark_stub
def florence_detect_impl(frames: list[Frame]) -> list[FrameDetections]:
    sorted_frames = sorted(frames, key=lambda f: f.frame_id)
    return [
        FrameDetections(
            detector="florence",
            frame_id=f.frame_id,
            detections=[],
            detector_error=False,
        )
        for f in sorted_frames
    ]
