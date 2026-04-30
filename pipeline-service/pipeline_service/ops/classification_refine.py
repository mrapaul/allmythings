"""§3.12 classification_refine — section-01 stub.

Pass-through of input SceneObservation. Real Qwen-VL tier chain ports in
section-03.
"""
from __future__ import annotations

from pipeline_service.ops._stub import mark_stub
from pipeline_service.types import SceneObservation


@mark_stub
def classification_refine_impl(observation: SceneObservation) -> SceneObservation:
    return observation
