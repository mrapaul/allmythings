"""§3.14 self_diagnosis — section-01 stub.

Section-01: terminal branch only — the impl yields the input unchanged.
The Dagster wrapper in ``dagster_defs.py`` declares ``DynamicOut`` so
section-07 can drop in fan-out logic without re-wiring the graph.
"""
from __future__ import annotations

from typing import Iterator

from pipeline_service.ops._stub import mark_stub
from pipeline_service.types import SceneObservation


@mark_stub
def self_diagnosis_impl(
    observation: SceneObservation,
    rerun_depth: int = 0,
) -> Iterator[SceneObservation]:
    """Yield exactly one ``SceneObservation`` (the terminal branch).

    Section-07 will replace this with logic that yields RerunDirectives via
    Dagster's DynamicOut for the rerun branch.
    """
    yield observation
