"""§7 metric tests — pure functions, no model calls."""
from __future__ import annotations

import base64

import numpy as np
import pytest

from pipeline_service.eval.metrics import (
    agreement_coverage_avg,
    agreement_precision_avg,
    empty_detection_set_rate,
    multi_frame_stability,
    op_failure_rate,
    self_diagnosis_trigger_rate,
    single_source_run_rate,
)
from pipeline_service.types import (
    BBox,
    OpError,
    PipelineDetection,
    SceneObservation,
)


def _obs(
    *,
    coverage: float = 0.0,
    precision: float = 0.0,
    detections: list[PipelineDetection] | None = None,
    flag_reason: str | None = None,
    flagged: bool = False,
    self_diag: bool = False,
    errors: list[OpError] | None = None,
) -> SceneObservation:
    return SceneObservation.empty(scene_id="s", run_id="r", frame_ids=[]).model_copy(
        update={
            "agreementCoverage": coverage,
            "agreementPrecision": precision,
            "detections": detections or [],
            "flagReason": flag_reason,
            "flagged": flagged,
            "selfDiagnosisTriggered": self_diag,
            "errors": errors or [],
        }
    )


def _det(det_id: str, vec: np.ndarray | None = None) -> PipelineDetection:
    crop_b64 = None
    if vec is not None:
        i8 = np.round(np.clip(vec.astype(np.float32), -1, 1) * 127).astype(np.int8)
        crop_b64 = base64.b64encode(i8.tobytes()).decode("ascii")
    return PipelineDetection(
        id=det_id,
        bbox=BBox(x=0, y=0, width=1, height=1),
        primaryLabel="lamp",
        cropEmbeddingB64=crop_b64,
    )


def _normed(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    v = rng.standard_normal(768).astype(np.float32)
    return v / np.linalg.norm(v)


# --- aggregate metrics --------------------------------------------------------

def test_agreement_coverage_avg_mean() -> None:
    obs = [_obs(coverage=0.4), _obs(coverage=0.6), _obs(coverage=0.8)]
    assert agreement_coverage_avg(obs) == pytest.approx(0.6, abs=0.001)


def test_agreement_coverage_avg_empty_zero_not_nan() -> None:
    assert agreement_coverage_avg([]) == 0.0


def test_agreement_precision_avg_mean() -> None:
    obs = [_obs(precision=0.2), _obs(precision=0.4)]
    assert agreement_precision_avg(obs) == pytest.approx(0.3, abs=0.001)


def test_self_diagnosis_trigger_rate_counts_true() -> None:
    obs = [_obs(self_diag=True), _obs(self_diag=False), _obs(self_diag=True)]
    assert self_diagnosis_trigger_rate(obs) == pytest.approx(2 / 3, abs=0.001)


def test_op_failure_rate_counts_observations_with_errors() -> None:
    obs = [
        _obs(),
        _obs(errors=[OpError(op="florence_detect", code="timeout", message="x")]),
    ]
    assert op_failure_rate(obs) == 0.5


def test_single_source_run_rate_counts_only_that_flag() -> None:
    obs = [
        _obs(flag_reason="single_source_run"),
        _obs(flag_reason="empty_detection_set"),
        _obs(),
    ]
    assert single_source_run_rate(obs) == pytest.approx(1 / 3, abs=0.001)


def test_empty_detection_set_rate_counts_only_flagged() -> None:
    obs = [
        _obs(flag_reason="empty_detection_set"),
        _obs(detections=[]),  # empty but NOT flagged → not counted
        _obs(flag_reason="empty_detection_set"),
    ]
    assert empty_detection_set_rate(obs) == pytest.approx(2 / 3, abs=0.001)


# --- multi_frame_stability ----------------------------------------------------

def test_multi_frame_stability_identity_is_one() -> None:
    v = _normed(1)
    a = _obs(detections=[_det("d1", v), _det("d2", _normed(2))])
    assert multi_frame_stability(a, a) == 1.0


def test_multi_frame_stability_disjoint_is_zero() -> None:
    a = _obs(detections=[_det("a1", _normed(1))])
    # b's vector is orthogonal-ish to a's by independent seed; cosine << 0.85.
    b = _obs(detections=[_det("b1", _normed(99))])
    assert multi_frame_stability(a, b) == 0.0


def test_multi_frame_stability_jaccard_partial() -> None:
    """3 detections in each; one pair matches, two unmatched on each side
    → Jaccard = 1 / (3 + 3 - 1) = 1/5 = 0.2."""
    shared = _normed(42)
    a = _obs(
        detections=[
            _det("a1", shared),
            _det("a2", _normed(2)),
            _det("a3", _normed(3)),
        ]
    )
    b = _obs(
        detections=[
            _det("b1", shared),
            _det("b2", _normed(99)),
            _det("b3", _normed(100)),
        ]
    )
    assert multi_frame_stability(a, b) == pytest.approx(1 / 5, abs=0.001)


def test_multi_frame_stability_symmetric() -> None:
    shared = _normed(42)
    a = _obs(detections=[_det("a1", shared), _det("a2", _normed(2))])
    b = _obs(detections=[_det("b1", shared), _det("b2", _normed(3))])
    assert multi_frame_stability(a, b) == multi_frame_stability(b, a)


def test_multi_frame_stability_one_empty_is_zero() -> None:
    a = _obs(detections=[])
    b = _obs(detections=[_det("b1", _normed(1))])
    assert multi_frame_stability(a, b) == 0.0


def test_multi_frame_stability_uses_int8_dequant_path() -> None:
    """The metric must round-trip through int8. Vectors that are byte-equal
    after quantisation must produce identity scores."""
    v = _normed(7)
    a = _obs(detections=[_det("d1", v)])
    b = _obs(detections=[_det("d1", v)])
    assert multi_frame_stability(a, b) == 1.0


def test_metrics_in_unit_interval() -> None:
    obs = [_obs(coverage=0.4, precision=0.2)]
    for fn in (
        agreement_coverage_avg,
        agreement_precision_avg,
        op_failure_rate,
        self_diagnosis_trigger_rate,
        single_source_run_rate,
        empty_detection_set_rate,
    ):
        v = fn(obs)
        assert 0.0 <= v <= 1.0
