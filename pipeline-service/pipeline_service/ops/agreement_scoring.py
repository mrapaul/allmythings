"""§3.13 agreement_scoring — section-01 stub.

Stub: empty-detection-set semantics (coverage=0.0, precision=0.0). The
stub does NOT set ``flagged=True`` for ``empty_detection_set`` because
that requires checking ``norm(scene_embedding) > ε`` which the stub
can't do reliably; section-07 lands the real flag logic.
"""
from __future__ import annotations

from pipeline_service.ops._stub import mark_stub
from pipeline_service.types import SceneObservation


@mark_stub
def agreement_scoring_impl(observation: SceneObservation) -> SceneObservation:
    return observation.model_copy(
        update={"agreementCoverage": 0.0, "agreementPrecision": 0.0}
    )
