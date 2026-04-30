"""§3.15 assemble_result — pure transformation, error-tolerant."""
from __future__ import annotations

from typing import Any

import pytest


def _empty_observation() -> Any:
    from pipeline_service.types import SceneObservation

    return SceneObservation.empty(
        scene_id="scene-A",
        run_id="run-1",
        frame_ids=["F0", "F1", "F2"],
    )


def test_pure_no_io(monkeypatch: pytest.MonkeyPatch) -> None:
    """assemble_result must not touch the network or any model client."""
    from pipeline_service.ops import assemble_result as ar

    # If this file ever imports any client by accident, fail fast — keep it pure.
    forbidden = ("httpx", "requests", "urllib3.connection")
    import sys
    for name in forbidden:
        # Import-by-side-effect of running assemble_result_impl is the smell;
        # we proxy by checking the module didn't grow a client at import time.
        # (httpx may already be loaded by FastAPI in other tests; only assert
        # the assemble module doesn't itself reference it.)
        assert not hasattr(ar, name), f"assemble_result must not import {name}"

    obs = _empty_observation()
    out = ar.assemble_result_impl(obs, started_ms=1, finished_ms=2)
    assert out["sceneId"] == "scene-A"
    assert out["runId"] == "run-1"


def test_emits_scene_observation_shape() -> None:
    from pipeline_service.ops.assemble_result import assemble_result_impl

    obs = _empty_observation()
    out = assemble_result_impl(obs, started_ms=0, finished_ms=42)

    # Required wire fields per §5.1
    for key in (
        "sceneId",
        "runId",
        "frameIds",
        "detections",
        "agreementCoverage",
        "agreementPrecision",
        "selfDiagnosisTriggered",
        "rerunDepth",
        "flagged",
        "processingMs",
        "errors",
        "tileErrors",
    ):
        assert key in out, f"assemble_result missing required field {key!r}"
    assert out["processingMs"] == 42
    assert isinstance(out["detections"], list)


def test_pydantic_failure_emits_minimal_valid_observation() -> None:
    """If the input is malformed and Pydantic raises during the assemble pass,
    the op MUST NOT raise — it returns a minimal valid SceneObservation
    flagged=True, flag_reason='assemble_failed', error in errors[]."""
    from pipeline_service.ops.assemble_result import assemble_result_impl

    # An obviously-broken sentinel: not a SceneObservation, not a dict either.
    out = assemble_result_impl(object(), started_ms=0, finished_ms=1)  # type: ignore[arg-type]
    assert out["flagged"] is True
    assert out["flagReason"] == "assemble_failed"
    assert out["errors"], "errors[] must contain the exception summary"
    assert out["errors"][0]["op"] == "assemble_result"


def test_tile_errors_aggregated_across_frames() -> None:
    """tile_errors arriving per-frame must be aggregated into the final
    SceneObservation.tileErrors list.
    """
    from pipeline_service.ops.assemble_result import assemble_result_impl
    from pipeline_service.types import SceneObservation, TileError

    obs = _empty_observation()
    obs = obs.with_tile_errors(
        [
            TileError(tileIndex=0, code="timeout", message="frame F0 tile 0 timed out"),
            TileError(tileIndex=2, code="oom", message="frame F1 tile 2 oom"),
        ]
    )
    assert isinstance(obs, SceneObservation)
    out = assemble_result_impl(obs, started_ms=0, finished_ms=10)
    assert len(out["tileErrors"]) == 2
    codes = {te["code"] for te in out["tileErrors"]}
    assert codes == {"timeout", "oom"}


def test_deterministic_branch_selection() -> None:
    """When self_diagnosis fans out (section-07), assemble_result must pick a
    deterministic branch — NOT positional [-1], because DynamicOutput
    mapping_key order is unspecified.

    Contract: pick the deepest rerunDepth, then highest agreementCoverage,
    then lexicographic sceneId.
    """
    from pipeline_service.dagster_defs import select_terminal_branch
    from pipeline_service.types import SceneObservation

    a = SceneObservation.empty(scene_id="s-A", run_id="r", frame_ids=[]).model_copy(
        update={"rerunDepth": 1, "agreementCoverage": 0.4}
    )
    b = SceneObservation.empty(scene_id="s-B", run_id="r", frame_ids=[]).model_copy(
        update={"rerunDepth": 2, "agreementCoverage": 0.3}
    )  # deepest
    c = SceneObservation.empty(scene_id="s-C", run_id="r", frame_ids=[]).model_copy(
        update={"rerunDepth": 0, "agreementCoverage": 0.9}
    )

    assert select_terminal_branch([a, b, c]).sceneId == "s-B"
    assert select_terminal_branch([c, b, a]).sceneId == "s-B"
    assert select_terminal_branch([b, a, c]).sceneId == "s-B"

    # Tie on rerunDepth → highest agreementCoverage wins.
    d = SceneObservation.empty(scene_id="s-D", run_id="r", frame_ids=[]).model_copy(
        update={"rerunDepth": 1, "agreementCoverage": 0.8}
    )
    assert select_terminal_branch([a, d]).sceneId == "s-D"
    assert select_terminal_branch([d, a]).sceneId == "s-D"

    # Tie on rerunDepth + coverage → lexicographic sceneId wins.
    e = SceneObservation.empty(scene_id="s-E", run_id="r", frame_ids=[]).model_copy(
        update={"rerunDepth": 1, "agreementCoverage": 0.4}
    )
    f = SceneObservation.empty(scene_id="s-F", run_id="r", frame_ids=[]).model_copy(
        update={"rerunDepth": 1, "agreementCoverage": 0.4}
    )
    assert select_terminal_branch([e, f]).sceneId == "s-F"
    assert select_terminal_branch([f, e]).sceneId == "s-F"


def test_upstream_errors_propagated_unchanged() -> None:
    from pipeline_service.ops.assemble_result import assemble_result_impl

    obs = _empty_observation()
    obs = obs.with_errors(
        [
            {
                "op": "florence_detect",
                "code": "timeout",
                "message": "Florence didn't respond in 10s",
            }
        ]
    )
    out = assemble_result_impl(obs, started_ms=0, finished_ms=1)
    assert out["errors"] == [
        {
            "op": "florence_detect",
            "code": "timeout",
            "message": "Florence didn't respond in 10s",
        }
    ]
