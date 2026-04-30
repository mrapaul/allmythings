"""§3.13 agreement_scoring tests."""
from __future__ import annotations

from pipeline_service.ops.agreement_scoring import agreement_scoring_impl
from pipeline_service.types import (
    BBox,
    ContributingSignal,
    PipelineDetection,
    SceneObservation,
)


def _det(det_id: str, *, signals: list[ContributingSignal]) -> PipelineDetection:
    return PipelineDetection(
        id=det_id,
        bbox=BBox(x=0, y=0, width=1, height=1),
        primaryLabel="lamp",
        contributingSignals=signals,
    )


def _obs(detections: list[PipelineDetection], frame_ids: list[str]) -> SceneObservation:
    return SceneObservation.empty(
        scene_id="s", run_id="r", frame_ids=frame_ids
    ).model_copy(update={"detections": detections})


def test_florence_plus_gdino_same_frame_yields_score_2() -> None:
    """REGRESSION: Florence + gdino on the same frame F1 → 2 classes
    (first_pass + frame:F1). Without the regression guard this would
    be 3 (one for each detector + the frame)."""
    signals = [
        ContributingSignal(detector="florence", frameId="F1", rawConfidence=None),
        ContributingSignal(detector="gdino", frameId="F1", rawConfidence=0.7),
    ]
    obs = _obs([_det("d1", signals=signals)], frame_ids=["F1"])
    out = agreement_scoring_impl(obs)
    assert out.detections[0].agreementScore == 2


def test_florence_plus_gdino_plus_sahi_yields_score_3() -> None:
    signals = [
        ContributingSignal(detector="florence", frameId="F1", rawConfidence=None),
        ContributingSignal(detector="gdino", frameId="F1", rawConfidence=0.7),
        ContributingSignal(detector="gdino-sahi", frameId="F1", rawConfidence=0.6),
    ]
    obs = _obs([_det("d1", signals=signals)], frame_ids=["F1"])
    out = agreement_scoring_impl(obs)
    assert out.detections[0].agreementScore == 3


def test_three_frames_first_pass_each_yields_score_4() -> None:
    signals = [
        ContributingSignal(detector="florence", frameId=f"F{i}", rawConfidence=None)
        for i in range(3)
    ]
    obs = _obs([_det("d1", signals=signals)], frame_ids=["F0", "F1", "F2"])
    out = agreement_scoring_impl(obs)
    # {first_pass, frame:F0, frame:F1, frame:F2} = 4
    assert out.detections[0].agreementScore == 4


def test_empty_detections_zero_metrics() -> None:
    obs = _obs([], frame_ids=["F0"])
    out = agreement_scoring_impl(obs)
    assert out.agreementCoverage == 0.0
    assert out.agreementPrecision == 0.0


def test_empty_detections_non_blank_scene_flagged() -> None:
    obs = _obs([], frame_ids=["F0"])
    out = agreement_scoring_impl(obs, scene_embedding_norm=1.0)
    assert out.flagged is True
    assert out.flagReason == "empty_detection_set"


def test_empty_detections_blank_scene_not_flagged() -> None:
    obs = _obs([], frame_ids=["F0"])
    out = agreement_scoring_impl(obs, scene_embedding_norm=1e-9)
    assert out.flagged is False


def test_single_source_run_flag() -> None:
    """All detections first-pass-only AND all from Florence AND only one frame."""
    signals = [
        ContributingSignal(detector="florence", frameId="F0", rawConfidence=None),
    ]
    obs = _obs([_det("d1", signals=signals)], frame_ids=["F0"])
    out = agreement_scoring_impl(obs)
    assert out.flagged is True
    assert out.flagReason == "single_source_run"


def test_input_not_mutated() -> None:
    signals = [ContributingSignal(detector="florence", frameId="F0", rawConfidence=None)]
    obs = _obs([_det("d1", signals=signals)], frame_ids=["F0"])
    original_score = obs.detections[0].agreementScore
    out = agreement_scoring_impl(obs)
    assert obs.detections[0].agreementScore == original_score
    assert out is not obs
