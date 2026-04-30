"""§3.14 self_diagnosis — REAL op.

DynamicOut fan-out: yields zero-or-one ``RerunDirective`` per call. Zero
yields means "terminal — assemble_result with the current observation".

Trigger logic (§3.14):
  - rerunDepth >= MAX_RERUNS → terminal with flag_reason=
    "diagnosis_budget_exhausted".
  - no-improvement bail-out: if rerunDepth >= 1 and current coverage <=
    previous coverage, terminal with the PREVIOUS rerun's result.
  - else if any of {coverage < tau_cov, precision < tau_prec,
    flag_reason in {empty_detection_set, single_source_run}}: yield one
    DynamicOutput(RerunDirective(level=rerunDepth+1, ...)).

Override builder applies the §6.4 strictness ladder additively. Level-2's
cross_frame_embedding_theta uses ``max(theta - 0.05, 0.7)`` — REGRESSION
guard against the original "halve" bug.
"""
from __future__ import annotations

from typing import Iterator, Optional

from pipeline_service.ops._agreement_math import (
    lower_cross_frame_theta,
    lower_gdino_score_thr,
)
from pipeline_service.types import (
    PipelineConfig,
    RerunDirective,
    SceneObservation,
)


def _build_overrides(level: int, config: PipelineConfig) -> PipelineConfig:
    """Apply Level-1 (always) + Level-2 (when level>=2) deltas, additively.

    Level-1 changes:
      - lower gdino_score_thr via lower_gdino_score_thr()
      - force qwen7b for classification_refine
    Level-2 (additive):
      - lower crossFrameEmbeddingTheta via lower_cross_frame_theta()
        (additive -0.05, floor 0.7) — NEVER halved.
    """
    new_thr = lower_gdino_score_thr(config.thresholds.detectionConfidenceMin)
    overrides = config.model_copy(
        update={
            "thresholds": config.thresholds.model_copy(
                update={"detectionConfidenceMin": new_thr}
            ),
            "classificationTierForcing": "qwen7b",
        }
    )
    if level >= 2:
        new_cf = lower_cross_frame_theta(
            overrides.thresholds.crossFrameEmbeddingTheta
        )
        overrides = overrides.model_copy(
            update={
                "thresholds": overrides.thresholds.model_copy(
                    update={"crossFrameEmbeddingTheta": new_cf}
                )
            }
        )
    return overrides


_RERUN_TRIGGER_REASONS = {"empty_detection_set", "single_source_run"}


def self_diagnosis_impl(
    observation: SceneObservation,
    rerun_depth: int = 0,
    *,
    config: Optional[PipelineConfig] = None,
    previous_coverage: Optional[float] = None,
    previous_observation: Optional[SceneObservation] = None,
) -> Iterator[SceneObservation | tuple[str, SceneObservation, RerunDirective]]:
    """Yield exactly one element:
      - SceneObservation (terminal — caller routes to assemble_result), OR
      - tuple (mapping_key, terminal_obs, RerunDirective) so the Dagster
        wrapper can decide whether to materialise a fan-out.

    The tuple shape is unusual but serves the unit tests, which inspect
    the directive directly. The Dagster wrapper unpacks and emits the
    appropriate Out / DynamicOutput.
    """
    cfg = config or PipelineConfig()
    max_reruns = cfg.thresholds.maxReruns
    tau_cov = cfg.thresholds.agreementCoverageMin
    tau_prec = cfg.thresholds.agreementPrecisionMin

    obs = observation.model_copy(update={"rerunDepth": rerun_depth})

    # 1. Budget exhausted.
    if rerun_depth >= max_reruns:
        yield obs.model_copy(
            update={
                "flagged": True,
                "flagReason": "diagnosis_budget_exhausted",
            }
        )
        return

    # 2. No-improvement bail-out.
    if (
        rerun_depth >= 1
        and previous_coverage is not None
        and obs.agreementCoverage <= previous_coverage
        and previous_observation is not None
    ):
        yield previous_observation
        return

    # 3. Trigger conditions.
    needs_rerun = (
        obs.agreementCoverage < tau_cov
        or obs.agreementPrecision < tau_prec
        or (obs.flagged and obs.flagReason in _RERUN_TRIGGER_REASONS)
    )
    if not needs_rerun:
        yield obs
        return

    next_depth = rerun_depth + 1
    overrides = _build_overrides(next_depth, cfg)
    reason = "low_coverage"
    if obs.flagReason == "empty_detection_set":
        reason = "empty_detection_set"
    elif obs.flagReason == "single_source_run":
        reason = "single_source_run"
    directive = RerunDirective(
        next_depth=next_depth,
        strictness_level=next_depth,
        overrides=overrides,
        reason=reason,
    )
    yield (f"rerun_{next_depth}", obs, directive)
