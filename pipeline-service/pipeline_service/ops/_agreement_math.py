"""Pure helpers for agreement_scoring + self_diagnosis (§3.13/§3.14/§6).

Three regression guards live here:
  - signal_class_of('gdino') == 'first_pass' (SAME class as Florence)
  - empty list → coverage/precision == 0.0 (NOT NaN, NOT 1.0)
  - lower_cross_frame_theta() does max(theta - 0.05, 0.7), NEVER halves.
"""
from __future__ import annotations

import math
from typing import Iterable

from pipeline_service.types import ContributingSignal, PipelineDetection


def signal_class_of(contributor: ContributingSignal) -> str:
    """Map a ContributingSignal to its detector signal class.

    Florence and Grounding DINO BOTH map to ``first_pass`` — they're both
    first-pass open-vocab detectors with overlapping training data;
    treating them as independent inflates ``agreement_score`` and makes
    the confidence sigmoid lie. SAHI's tiled re-pass is its own class.
    """
    detector = contributor.detector
    if detector in ("florence", "gdino"):
        return "first_pass"
    if detector == "gdino-sahi":
        return "tiled"
    return f"detector:{detector}"  # defensive — should never trigger


def confidence_from_score(
    score: int,
    *,
    k_baseline: int = 2,
    sigma: float = 1.0,
) -> float:
    """Sigmoid-calibrated confidence: clip01(sigmoid((score - K) / sigma)).

    Calibration table (defaults K=2, sigma=1):
        score 0 → 0.12
        score 1 → 0.27
        score 2 → 0.50
        score 3 → 0.73
        score 4 → 0.88
        score 5 → 0.95
    """
    sig = 1.0 / (1.0 + math.exp(-(score - k_baseline) / sigma))
    return max(0.0, min(1.0, sig))


def coverage(detections: Iterable[PipelineDetection]) -> float:
    """Fraction of detections with agreement_score >= 2.

    Empty input → 0.0 (never NaN, never 1.0). Regression guard.
    """
    dets = list(detections)
    if not dets:
        return 0.0
    return sum(1 for d in dets if d.agreementScore >= 2) / len(dets)


def precision(detections: Iterable[PipelineDetection]) -> float:
    """Fraction of detections with agreement_score >= 3.

    Empty input → 0.0. Regression guard.
    """
    dets = list(detections)
    if not dets:
        return 0.0
    return sum(1 for d in dets if d.agreementScore >= 3) / len(dets)


def lower_gdino_score_thr(thr_in: float) -> float:
    """Level-1 ladder: lower the gdino score threshold by min(0.10, thr * 0.30).

    Floor 0.05.
    """
    delta = min(0.10, thr_in * 0.30)
    return max(thr_in - delta, 0.05)


def lower_cross_frame_theta(theta_in: float) -> float:
    """Level-2 ladder: subtract 0.05 (additive), floor 0.7.

    REGRESSION GUARD: this NEVER returns ``theta / 2``. The original
    'halve' implementation in the iteration-1 review was a bug; only
    additive deltas with a hard floor are stable across retunes.
    """
    return max(theta_in - 0.05, 0.7)
