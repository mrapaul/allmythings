"""§3.10 cross_pass_dedup — section-01 stub. Real impl in section-06."""
from __future__ import annotations

from pipeline_service.ops._stub import mark_stub
from pipeline_service.types import DedupedFrame, EmbeddedFrame, FusedFrame


@mark_stub
def cross_pass_dedup_impl(
    fused_frame: FusedFrame,
    embeddings: dict | EmbeddedFrame,
) -> DedupedFrame:
    return DedupedFrame(frame_id=fused_frame.frame_id, detections=[])
