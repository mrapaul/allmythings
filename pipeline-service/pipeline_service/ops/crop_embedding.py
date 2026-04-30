"""§3.9 crop_embedding — section-01 stub. Real DINOv2 in section-04."""
from __future__ import annotations

from pipeline_service.ops._stub import mark_stub
from pipeline_service.types import EmbeddedFrame, FusedFrame


@mark_stub
def crop_embedding_impl(
    frame_id: str,
    fused_frame: FusedFrame,
) -> EmbeddedFrame:
    return EmbeddedFrame(frame_id=frame_id, embeddings={})
