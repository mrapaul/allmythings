"""Pure-function tests for the agreement-math helpers (§3.13/§6).

Three regression guards explicitly named in test IDs:
  - test_florence_and_gdino_share_first_pass_class
  - test_level2_theta_subtracts_005_not_halved
  - test_empty_detection_set_returns_zero_not_nan
"""
from __future__ import annotations

import math

import pytest

from pipeline_service.ops._agreement_math import (
    confidence_from_score,
    coverage,
    lower_cross_frame_theta,
    lower_gdino_score_thr,
    precision,
    signal_class_of,
)
from pipeline_service.types import (
    BBox,
    ContributingSignal,
    PipelineDetection,
)


def _det(score: float = 0.0) -> PipelineDetection:
    return PipelineDetection(
        id="d",
        bbox=BBox(x=0, y=0, width=1, height=1),
        primaryLabel="x",
        agreementScore=score,
    )


# --- signal_class_of -----------------------------------------------------------

def test_florence_and_gdino_share_first_pass_class() -> None:
    """REGRESSION: Florence and gdino share the same signal class — they're
    both first-pass open-vocab detectors with overlapping training data.
    Treating them as independent inflates agreement_score.
    """
    flo = ContributingSignal(detector="florence", frameId="F0", rawConfidence=None)
    gd = ContributingSignal(detector="gdino", frameId="F0", rawConfidence=0.7)
    assert signal_class_of(flo) == "first_pass"
    assert signal_class_of(gd) == "first_pass"


def test_gdino_sahi_is_tiled_class() -> None:
    s = ContributingSignal(detector="gdino-sahi", frameId="F0", rawConfidence=0.5)
    assert signal_class_of(s) == "tiled"


# --- confidence formula table --------------------------------------------------

@pytest.mark.parametrize(
    "score,expected",
    [
        (0, 0.12),
        (1, 0.27),
        (2, 0.50),
        (3, 0.73),
        (4, 0.88),
        (5, 0.95),
    ],
)
def test_confidence_table(score: int, expected: float) -> None:
    actual = confidence_from_score(score)
    assert math.isclose(actual, expected, abs_tol=0.02), (
        f"score {score}: expected ~{expected}, got {actual}"
    )


def test_confidence_clamped_to_unit_interval() -> None:
    assert confidence_from_score(-100) >= 0.0
    assert confidence_from_score(100) <= 1.0


# --- coverage / precision ------------------------------------------------------

def test_empty_detection_set_returns_zero_not_nan() -> None:
    """REGRESSION: empty detections list → 0.0 (NOT NaN, NOT 1.0)."""
    assert coverage([]) == 0.0
    assert precision([]) == 0.0
    assert not math.isnan(coverage([]))
    assert not math.isnan(precision([]))


def test_coverage_mean_score_ge_2() -> None:
    dets = [_det(score=1), _det(score=2), _det(score=3), _det(score=4)]
    # 3 of 4 have score >= 2.
    assert coverage(dets) == pytest.approx(0.75)


def test_precision_mean_score_ge_3() -> None:
    dets = [_det(score=1), _det(score=2), _det(score=3), _det(score=4)]
    # 2 of 4 have score >= 3.
    assert precision(dets) == pytest.approx(0.5)


# --- ladder: gdino threshold lowering -----------------------------------------

@pytest.mark.parametrize(
    "thr_in,expected_max",
    [
        (0.30, 0.21),  # 0.30 - min(0.10, 0.09) = 0.30 - 0.09 = 0.21
        (0.50, 0.40),  # 0.50 - min(0.10, 0.15) = 0.50 - 0.10 = 0.40
        (0.05, 0.05),  # floor
    ],
)
def test_lower_gdino_score_thr(thr_in: float, expected_max: float) -> None:
    assert lower_gdino_score_thr(thr_in) == pytest.approx(expected_max, abs=0.001)


# --- ladder: Level-2 theta (regression guard) ---------------------------------

def test_level2_theta_subtracts_005_not_halved() -> None:
    """REGRESSION: lower_cross_frame_theta does an additive -0.05, never
    halves. The original 'theta / 2' was a bug.
    """
    cases = [(0.85, 0.80), (0.80, 0.75), (0.75, 0.70), (0.72, 0.70)]
    for theta_in, expected in cases:
        actual = lower_cross_frame_theta(theta_in)
        assert actual == pytest.approx(expected, abs=0.001), (
            f"theta_in={theta_in} → expected {expected}, got {actual}"
        )
        # Explicit anti-halve assertion: must NOT return theta/2.
        assert abs(actual - theta_in / 2) > 0.05
