"""§3.11 cross_frame_dedup — section-01 stub. Real impl in section-06."""
from __future__ import annotations

from pipeline_service.ops._stub import mark_stub
from pipeline_service.types import DedupedFrame, SceneObservation


@mark_stub
def cross_frame_dedup_impl(
    deduped_frames: list[DedupedFrame],
    scene_id: str = "scene-stub",
    run_id: str = "run-stub",
) -> SceneObservation:
    frame_ids = [f.frame_id for f in sorted(deduped_frames, key=lambda f: f.frame_id)]
    return SceneObservation.empty(scene_id=scene_id, run_id=run_id, frame_ids=frame_ids)
