"""§3.2 scene_embedding — section-01 stub. Real impl in section-04."""
from __future__ import annotations

from datetime import datetime, timezone

from pipeline_service.ops._stub import mark_stub
from pipeline_service.types import Frame, SceneEmbedding


@mark_stub
def scene_embedding_impl(frames: list[Frame]) -> list[SceneEmbedding]:
    """Stub: emit zero-vector SceneEmbedding per frame.

    ``embedding_failed=False`` keeps the stub semantics simple — section-04
    swaps in real DINOv2 inference and the failure / cache-bypass logic.
    """
    sorted_frames = sorted(frames, key=lambda f: f.frame_id)
    now = datetime.now(timezone.utc)
    return [
        SceneEmbedding(
            frame_id=f.frame_id,
            vector_bytes=b"\x00" * (768 * 2),  # f16 zeros
            embedded_at=now,
            embedding_failed=False,
        )
        for f in sorted_frames
    ]
