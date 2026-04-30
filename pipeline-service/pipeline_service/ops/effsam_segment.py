"""§3.7 effsam_segment — section-01 stub. Real impl in section-05."""
from __future__ import annotations

from pipeline_service.ops._stub import mark_stub
from pipeline_service.types import Frame, FusedFrame


@mark_stub
def effsam_segment_impl(
    frames: list[Frame],
    fused_frames: list[FusedFrame],
) -> list[bytes]:
    """Stub: empty mask list. Real impl returns one mask per fused box."""
    return []
