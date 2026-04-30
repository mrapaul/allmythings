"""§3.13 agreement_scoring — REAL op.

Adds per-detection agreement_score + confidence and scene-level
agreement_coverage + agreement_precision. Sets flagged + flag_reason for
the two failure modes detectable here:

  - empty_detection_set: no detections AND scene_embedding is non-blank
  - single_source_run: every detection's only signal class is "first_pass"
    AND every contributor is detector='florence' AND only one frame_id

PURE op: no I/O, no model calls, no FAISS. Returns a NEW SceneObservation.
"""
from __future__ import annotations

from pipeline_service.ops._agreement_math import (
    confidence_from_score,
    coverage,
    precision,
    signal_class_of,
)
from pipeline_service.types import (
    ContributingSignal,
    PipelineDetection,
    SceneObservation,
)


def _score_detection(detection: PipelineDetection) -> PipelineDetection:
    classes: set[str] = set()
    for sig in detection.contributingSignals:
        classes.add(signal_class_of(sig))
        classes.add(f"frame:{sig.frameId}")
    score = len(classes)
    conf = confidence_from_score(score)
    return detection.model_copy(
        update={
            "agreementScore": float(score),
            "confidence": conf,
        }
    )


def _is_single_source_run(detections: list[PipelineDetection]) -> bool:
    """Per §3.13 step 5: every detection has signal_classes == {'first_pass'}
    only, AND every contributor is detector='florence', AND only one frame_id
    is represented.
    """
    if not detections:
        return False
    detectors_seen: set[str] = set()
    frames_seen: set[str] = set()
    for det in detections:
        sig_classes = {signal_class_of(s) for s in det.contributingSignals}
        if sig_classes != {"first_pass"}:
            return False
        for s in det.contributingSignals:
            detectors_seen.add(s.detector)
            frames_seen.add(s.frameId)
    return detectors_seen == {"florence"} and len(frames_seen) == 1


def agreement_scoring_impl(
    observation: SceneObservation,
    *,
    scene_embedding_norm: float = 0.0,
    blank_eps: float = 1e-6,
) -> SceneObservation:
    """Score the SceneObservation. ``scene_embedding_norm`` is the L2 norm
    of the median scene embedding (or 0 if unavailable); empty-detection
    flagging only fires when the scene is non-blank (norm > eps).
    """
    sorted_dets = sorted(observation.detections, key=lambda d: d.id)
    scored = [_score_detection(d) for d in sorted_dets]
    cov = coverage(scored)
    prec = precision(scored)

    flagged = observation.flagged
    flag_reason = observation.flagReason

    if not scored:
        if scene_embedding_norm > blank_eps:
            flagged = True
            flag_reason = "empty_detection_set"
        # else: blank scene with no detections is not a failure
    elif _is_single_source_run(scored):
        flagged = True
        flag_reason = "single_source_run"

    return observation.model_copy(
        update={
            "detections": scored,
            "agreementCoverage": cov,
            "agreementPrecision": prec,
            "flagged": flagged,
            "flagReason": flag_reason,
        }
    )
