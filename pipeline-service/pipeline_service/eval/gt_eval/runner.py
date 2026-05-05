"""Single-image pipeline shim for GT-eval.

Adapts the multi-frame burst entry point in ``corpus_walker`` to the
single-image surface needed by the GT-eval orchestrator. Builds a
synthetic one-frame ``CorpusItem``, drives ``pipeline_job.execute_in_process``,
and returns a ``SceneObservation``.

Optional env knobs (saved/restored around the call):
  * ``apply_eval_skip_sahi=True`` -> ``EVAL_SKIP_SAHI=1``
  * ``apply_eval_top_k=K``        -> ``CLASSIFICATION_TOP_K=str(K)``

Failure contract: any internal exception is converted into a flagged
``SceneObservation``; this function NEVER raises out. Per-image failure
must not abort a 500-image eval run.
"""
from __future__ import annotations

import hashlib
import logging
import os
import time
import uuid
from contextlib import ExitStack, contextmanager
from pathlib import Path
from typing import Iterator, Optional

from pipeline_service.eval.corpus_walker import CorpusItem
from pipeline_service.types import OpError, SceneObservation

logger = logging.getLogger(__name__)


def _build_corpus_item(image_path: Path) -> CorpusItem:
    return CorpusItem(
        scene_id=f"lvis-{image_path.stem}",
        capture_id="0",
        frame_paths=[image_path],
    )


def _build_run_config(
    image_path: Path, *, mime_type: str, scene_id: str
) -> tuple[dict, str, str]:
    """Build ``execute_in_process`` run config; return ``(config, frame_id, sha256)``."""
    raw = image_path.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    frame_id = f"{scene_id}/0/{image_path.stem}"
    run_config = {
        "ops": {
            "frame_intake": {
                "config": {
                    "frames": [
                        {
                            "frame_id": frame_id,
                            "sha256": sha,
                            "mime_type": mime_type,
                            "photo_bytes_hex": raw.hex(),
                        }
                    ]
                }
            }
        }
    }
    return run_config, frame_id, sha


@contextmanager
def _env_override(name: str, value: Optional[str]) -> Iterator[None]:
    """Set ``os.environ[name]=value`` on enter; restore on exit (exception-safe)."""
    if value is None:
        yield
        return
    prior_present = name in os.environ
    prior_value = os.environ.get(name)
    os.environ[name] = value
    try:
        yield
    finally:
        if prior_present and prior_value is not None:
            os.environ[name] = prior_value
        else:
            os.environ.pop(name, None)


def _flagged(
    image_path: Path,
    *,
    op: str,
    code: str,
    message: str,
    scene_id: str,
    frame_id: str,
) -> SceneObservation:
    obs = SceneObservation.empty(
        scene_id=scene_id,
        run_id=f"eval-failed-{scene_id}",
        frame_ids=[frame_id or image_path.name],
    )
    return obs.model_copy(
        update={
            "flagged": True,
            "flagReason": "pipeline_failed",
            "errors": [OpError(op=op, code=code, message=message)],
        }
    )


def _extract_observation(
    execute_result, *, scene_id: str, frame_id: str, image_path: Path
) -> SceneObservation:
    if not getattr(execute_result, "success", True):
        return _flagged(
            image_path,
            op="pipeline",
            code="DagsterRunFailed",
            message="execute_in_process returned success=False",
            scene_id=scene_id,
            frame_id=frame_id,
        )
    try:
        obs_dict = execute_result.output_for_node("assemble_result")
    except Exception as exc:  # noqa: BLE001 — runner contract: never raise out
        return _flagged(
            image_path,
            op="assemble_result",
            code=type(exc).__name__,
            message=str(exc),
            scene_id=scene_id,
            frame_id=frame_id,
        )
    if isinstance(obs_dict, SceneObservation):
        return obs_dict
    try:
        return SceneObservation.model_validate(obs_dict)
    except Exception as exc:  # noqa: BLE001
        return _flagged(
            image_path,
            op="assemble_result",
            code=type(exc).__name__,
            message=f"model_validate failed: {exc}",
            scene_id=scene_id,
            frame_id=frame_id,
        )


def single_image_pipeline_runner(
    image_path: Path,
    *,
    mime_type: str = "image/jpeg",
    apply_eval_skip_sahi: bool = False,
    apply_eval_top_k: Optional[int] = None,
) -> SceneObservation:
    """Run the existing pipeline on one image and return its ``SceneObservation``.

    On any internal failure, returns a flagged ``SceneObservation``;
    never raises out.
    """
    item = _build_corpus_item(image_path)
    try:
        run_config, frame_id, _sha = _build_run_config(
            image_path, mime_type=mime_type, scene_id=item.scene_id
        )
    except Exception as exc:  # noqa: BLE001
        return _flagged(
            image_path,
            op="runner",
            code=type(exc).__name__,
            message=f"run_config build failed: {exc}",
            scene_id=item.scene_id,
            frame_id=item.scene_id,
        )

    skip_sahi_value = "1" if apply_eval_skip_sahi else None
    top_k_value = str(apply_eval_top_k) if apply_eval_top_k is not None else None

    started_ms = int(time.time() * 1000)
    try:
        from pipeline_service.dagster_defs import pipeline_job  # lazy import
    except Exception as exc:  # noqa: BLE001
        return _flagged(
            image_path,
            op="runner",
            code=type(exc).__name__,
            message=f"pipeline_job import failed: {exc}",
            scene_id=item.scene_id,
            frame_id=frame_id,
        )

    try:
        with ExitStack() as stack:
            stack.enter_context(_env_override("EVAL_SKIP_SAHI", skip_sahi_value))
            stack.enter_context(_env_override("CLASSIFICATION_TOP_K", top_k_value))
            execute_result = pipeline_job.execute_in_process(
                run_config=run_config,
                tags={
                    "sceneId": item.scene_id,
                    "captureId": item.capture_id,
                    "pipelineStartedMs": str(started_ms),
                    "evalCaptureLabel": f"{item.scene_id}/{item.capture_id}",
                },
                run_id=str(uuid.uuid4()),
                raise_on_error=False,
            )
    except Exception as exc:  # noqa: BLE001
        return _flagged(
            image_path,
            op="pipeline",
            code=type(exc).__name__,
            message=f"runner_unhandled: {exc!r}",
            scene_id=item.scene_id,
            frame_id=frame_id,
        )

    return _extract_observation(
        execute_result,
        scene_id=item.scene_id,
        frame_id=frame_id,
        image_path=image_path,
    )


__all__ = ["single_image_pipeline_runner"]
