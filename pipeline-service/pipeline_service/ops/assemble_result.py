"""§3.15 assemble_result — pure transformation, error-tolerant.

The op MUST NOT raise on malformed input: a Pydantic validation error or
unexpected ``None`` reference produces a minimal valid SceneObservation
with ``flagged=True, flagReason='assemble_failed'`` and the exception
summary attached to ``errors[]``. The mobile must be able to render
something even if the last op blew up (§3.15).
"""
from __future__ import annotations

import logging
from typing import Any

from pipeline_service.types import OpError, SceneObservation

logger = logging.getLogger("pipeline_service.ops.assemble_result")


def assemble_result_impl(
    observation: SceneObservation,
    started_ms: int,
    finished_ms: int,
) -> dict[str, Any]:
    """Return the JSON-serialisable shape of the SceneObservation, with
    ``processingMs`` populated. On any failure path return a minimal-valid
    dictionary instead of raising.
    """
    try:
        if not isinstance(observation, SceneObservation):
            raise TypeError(
                f"expected SceneObservation, got {type(observation).__name__}"
            )
        # Defensive copy with computed processingMs.
        finalised = observation.model_copy(
            update={"processingMs": int(finished_ms - started_ms)}
        )
        return finalised.model_dump(mode="json", by_alias=True)
    except Exception as exc:  # broad on purpose — pipe straight into errors[]
        logger.warning("assemble_result failed: %s", exc, exc_info=True)
        scene_id = ""
        run_id = ""
        frame_ids: list[str] = []
        try:
            scene_id = getattr(observation, "sceneId", "") or ""
            run_id = getattr(observation, "runId", "") or ""
            frame_ids = list(getattr(observation, "frameIds", []) or [])
        except Exception:  # noqa: BLE001 — best-effort attribute access
            pass
        fallback = SceneObservation.empty(
            scene_id=scene_id, run_id=run_id, frame_ids=frame_ids
        ).model_copy(
            update={
                "flagged": True,
                "flagReason": "assemble_failed",
                "processingMs": int(max(finished_ms - started_ms, 0)),
                "errors": [
                    OpError(
                        op="assemble_result",
                        code=type(exc).__name__,
                        message=str(exc),
                    )
                ],
            }
        )
        return fallback.model_dump(mode="json", by_alias=True)


# Dagster ``@op`` wrapping for this op lives in ``pipeline_service.dagster_defs``
# so the graph can collect DynamicOut branches from self_diagnosis.
