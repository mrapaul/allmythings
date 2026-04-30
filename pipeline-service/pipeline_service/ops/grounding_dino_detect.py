"""§3.5 grounding_dino_detect — section-01 stub. Real impl in section-05."""
from __future__ import annotations

from pipeline_service.ops._stub import mark_stub
from pipeline_service.types import Frame, FrameDetections, PromptList


@mark_stub
def grounding_dino_detect_impl(
    frames: list[Frame],
    prompts: list[str] | PromptList,
) -> list[FrameDetections]:
    sorted_frames = sorted(frames, key=lambda f: f.frame_id)
    return [
        FrameDetections(
            detector="gdino",
            frame_id=f.frame_id,
            detections=[],
            detector_error=False,
        )
        for f in sorted_frames
    ]
