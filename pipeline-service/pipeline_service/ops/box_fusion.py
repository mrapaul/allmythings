"""§3.8 box_fusion — section-01 stub. Real WBF lands in section-06."""
from __future__ import annotations

from pipeline_service.ops._stub import mark_stub
from pipeline_service.types import FrameDetections, FusedFrame


@mark_stub
def box_fusion_impl(
    frame_id: str,
    per_detector_detections: list[FrameDetections],
) -> FusedFrame:
    return FusedFrame(frame_id=frame_id, fused=[])
