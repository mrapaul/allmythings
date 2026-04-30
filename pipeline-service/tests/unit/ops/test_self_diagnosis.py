"""§3.14 self_diagnosis tests."""
from __future__ import annotations

from pipeline_service.ops.self_diagnosis import self_diagnosis_impl
from pipeline_service.types import (
    BBox,
    ContributingSignal,
    PipelineConfig,
    PipelineDetection,
    RerunDirective,
    SceneObservation,
)


def _det(score: float = 0.0) -> PipelineDetection:
    return PipelineDetection(
        id="d",
        bbox=BBox(x=0, y=0, width=1, height=1),
        primaryLabel="x",
        agreementScore=score,
        contributingSignals=[
            ContributingSignal(detector="florence", frameId="F0", rawConfidence=None)
        ],
    )


def _obs(coverage: float, precision: float, *, depth: int = 0, **flags) -> SceneObservation:
    obs = SceneObservation.empty(scene_id="s", run_id="r", frame_ids=["F0"])
    return obs.model_copy(
        update={
            "agreementCoverage": coverage,
            "agreementPrecision": precision,
            "rerunDepth": depth,
            **flags,
        }
    )


def _consume(gen):
    return list(gen)


def test_above_thresholds_yields_terminal() -> None:
    obs = _obs(coverage=0.9, precision=0.6)
    items = _consume(self_diagnosis_impl(obs, rerun_depth=0))
    assert len(items) == 1
    assert isinstance(items[0], SceneObservation)
    assert items[0].agreementCoverage == 0.9


def test_below_coverage_yields_rerun() -> None:
    obs = _obs(coverage=0.3, precision=0.6)
    items = _consume(self_diagnosis_impl(obs, rerun_depth=0))
    assert len(items) == 1
    item = items[0]
    assert isinstance(item, tuple)
    mapping_key, terminal_obs, directive = item
    assert mapping_key == "rerun_1"
    assert isinstance(directive, RerunDirective)
    assert directive.next_depth == 1
    assert directive.strictness_level == 1


def test_below_precision_yields_rerun() -> None:
    obs = _obs(coverage=0.9, precision=0.1)
    items = _consume(self_diagnosis_impl(obs, rerun_depth=0))
    assert isinstance(items[0], tuple)


def test_empty_detection_set_flag_yields_rerun() -> None:
    obs = _obs(coverage=0.0, precision=0.0, flagged=True, flagReason="empty_detection_set")
    items = _consume(self_diagnosis_impl(obs, rerun_depth=0))
    assert isinstance(items[0], tuple)
    _, _, directive = items[0]
    assert directive.reason == "empty_detection_set"


def test_single_source_run_flag_yields_rerun() -> None:
    obs = _obs(coverage=0.9, precision=0.5, flagged=True, flagReason="single_source_run")
    items = _consume(self_diagnosis_impl(obs, rerun_depth=0))
    assert isinstance(items[0], tuple)
    _, _, directive = items[0]
    assert directive.reason == "single_source_run"


def test_max_reruns_terminates_with_budget_exhausted() -> None:
    obs = _obs(coverage=0.0, precision=0.0)
    items = _consume(self_diagnosis_impl(obs, rerun_depth=2))  # MAX_RERUNS=2
    assert len(items) == 1
    assert isinstance(items[0], SceneObservation)
    assert items[0].flagged is True
    assert items[0].flagReason == "diagnosis_budget_exhausted"


def test_no_improvement_bail_out_emits_previous() -> None:
    """If current coverage <= previous, emit the PREVIOUS rerun's result."""
    previous = _obs(coverage=0.5, precision=0.4, depth=0).model_copy(
        update={"sceneId": "PREV"}
    )
    current = _obs(coverage=0.4, precision=0.4, depth=1).model_copy(
        update={"sceneId": "CURR"}
    )
    items = _consume(
        self_diagnosis_impl(
            current,
            rerun_depth=1,
            previous_coverage=0.5,
            previous_observation=previous,
        )
    )
    assert len(items) == 1
    assert isinstance(items[0], SceneObservation)
    # PREVIOUS's result was emitted (sceneId='PREV').
    assert items[0].sceneId == "PREV"


def test_level2_directive_uses_subtract_005_not_halved() -> None:
    """REGRESSION: Level-2 cross_frame_embedding_theta = max(theta - 0.05, 0.7)."""
    cfg = PipelineConfig()
    # cfg.thresholds.crossFrameEmbeddingTheta default is 0.85.
    obs = _obs(coverage=0.0, precision=0.0, depth=1)
    items = _consume(self_diagnosis_impl(obs, rerun_depth=1, config=cfg))
    assert isinstance(items[0], tuple)
    _, _, directive = items[0]
    assert directive.strictness_level == 2
    # 0.85 - 0.05 = 0.80, NOT 0.425.
    import pytest

    assert directive.overrides.thresholds.crossFrameEmbeddingTheta == pytest.approx(0.80, abs=1e-9)


def test_dynamic_output_mapping_key_is_stable() -> None:
    obs = _obs(coverage=0.0, precision=0.0)
    items = _consume(self_diagnosis_impl(obs, rerun_depth=0))
    mapping_key, _, _ = items[0]
    assert mapping_key == "rerun_1"
