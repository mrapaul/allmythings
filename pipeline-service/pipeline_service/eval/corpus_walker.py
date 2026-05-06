"""§7 corpus walker — bridges on-disk corpora/<scene>/<capture>/frame-*.webp
to the Dagster pipeline so the eval rig produces real SceneObservations.

Layout the walker expects (matches scripts/fetch_corpus_from_web.py and
section-09 corpus protocol):

    corpora/
      scene_<id>/
        capture-1/
          frame-0.webp
          frame-1.webp
          frame-2.webp
        capture-2/
          frame-0.webp
          ...

For each (scene, capture) the walker:
  1. Reads the WEBP frames into a frame_intake payload.
  2. Invokes the configured pipeline runner, which returns a SceneObservation.
  3. Collects same-scene capture pairs for multi_frame_stability.

The runner is injectable so unit tests can exercise the walker without
spinning up Dagster and the model HTTP servers. The default runner uses
``pipeline_service.dagster_defs`` to execute the pipeline graph in-process.
"""
from __future__ import annotations

import hashlib
import logging
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from pipeline_service.types import OpError, SceneObservation

logger = logging.getLogger("pipeline_service.eval.corpus_walker")


_FRAME_GLOB = "frame-*.webp"


@dataclass(frozen=True)
class CorpusItem:
    """One pipeline run's worth of inputs: all frames for a (scene, capture)."""

    scene_id: str
    capture_id: str
    frame_paths: list[Path] = field(default_factory=list)


PipelineRunner = Callable[[CorpusItem, list[dict]], SceneObservation]


# --- discovery ---------------------------------------------------------------


def walk_corpus(corpora_dir: Path) -> list[CorpusItem]:
    """Discover (scene, capture) triplets on disk, sorted deterministically.

    A capture dir is included iff it contains at least one ``frame-*.webp``
    file. Empty dirs and non-image children are silently skipped — the
    fetcher may have partially failed and we don't want one bad scene to
    abort the whole eval.
    """
    if not corpora_dir.exists():
        return []
    items: list[CorpusItem] = []
    for scene_dir in sorted(p for p in corpora_dir.iterdir() if p.is_dir()):
        for capture_dir in sorted(p for p in scene_dir.iterdir() if p.is_dir()):
            frames = sorted(capture_dir.glob(_FRAME_GLOB))
            if not frames:
                continue
            items.append(
                CorpusItem(
                    scene_id=scene_dir.name,
                    capture_id=capture_dir.name,
                    frame_paths=frames,
                )
            )
    return items


# --- intake payload ----------------------------------------------------------


def build_intake_payload(item: CorpusItem) -> list[dict]:
    """Convert a CorpusItem into the dict-list that ``frame_intake_impl``
    expects: ``[{frame_id, sha256, mime_type, photo_bytes}]``.

    ``frame_id`` is namespaced by scene/capture to keep frame IDs unique
    across an eval run that walks many scenes.
    """
    payload: list[dict] = []
    for path in item.frame_paths:
        raw = path.read_bytes()
        sha = hashlib.sha256(raw).hexdigest()
        payload.append(
            {
                "frame_id": f"{item.scene_id}/{item.capture_id}/{path.stem}",
                "sha256": sha,
                "mime_type": "image/webp",
                "photo_bytes": raw,
            }
        )
    return payload


# --- default runner (Dagster) ------------------------------------------------


def default_pipeline_runner(item: CorpusItem, payload: list[dict]) -> SceneObservation:
    """Execute the Dagster pipeline against this item's frames.

    Imported lazily so unit tests that inject their own runner don't pay
    the Dagster import cost (and don't fail when the detection-service
    HTTP backends are unavailable in CI).
    """
    # Hex-encode bytes for the Dagster run-config (Dagster's @op config_schema
    # values must be JSON-serialisable).
    run_config_frames = [
        {
            "frame_id": p["frame_id"],
            "sha256": p["sha256"],
            "mime_type": p["mime_type"],
            "photo_bytes_hex": p["photo_bytes"].hex(),
        }
        for p in payload
    ]

    # Lazy import: dagster_defs pulls in the full op surface area.
    from pipeline_service.dagster_defs import pipeline_job  # type: ignore

    started_ms = int(time.time() * 1000)
    result = pipeline_job.execute_in_process(
        run_config={"ops": {"frame_intake": {"config": {"frames": run_config_frames}}}},
        tags={
            "sceneId": item.scene_id,
            "captureId": item.capture_id,
            "pipelineStartedMs": str(started_ms),
            "evalCaptureLabel": f"{item.scene_id}/{item.capture_id}",
        },
        run_id=str(uuid.uuid4()),
    )
    obs_dict = result.output_for_node("assemble_result")
    return SceneObservation.model_validate(obs_dict)


# --- run_corpus orchestration ------------------------------------------------


def _failed_observation(item: CorpusItem, exc: BaseException) -> SceneObservation:
    obs = SceneObservation.empty(
        scene_id=item.scene_id,
        run_id=f"eval-failed-{item.scene_id}-{item.capture_id}",
        frame_ids=[p.name for p in item.frame_paths],
    )
    return obs.model_copy(
        update={
            "flagged": True,
            "flagReason": "pipeline_failed",
            "errors": [
                OpError(
                    op="corpus_walker",
                    code=type(exc).__name__,
                    message=str(exc),
                )
            ],
        }
    )


def _build_pairs(
    by_scene: dict[str, list[SceneObservation]],
) -> list[tuple[SceneObservation, SceneObservation]]:
    """For each scene with ≥2 captures, emit each unordered pair once.

    multi_frame_stability is symmetric, so (a, b) and (b, a) would
    double-count. Pairs are emitted in capture-id order for determinism.
    """
    pairs: list[tuple[SceneObservation, SceneObservation]] = []
    for _scene_id, observations in by_scene.items():
        if len(observations) < 2:
            continue
        ordered = sorted(observations, key=lambda o: o.runId)
        for i in range(len(ordered)):
            for j in range(i + 1, len(ordered)):
                pairs.append((ordered[i], ordered[j]))
    return pairs


def run_corpus(
    corpora_dir: Path,
    *,
    pipeline_runner: PipelineRunner | None = None,
) -> tuple[list[SceneObservation], list[tuple[SceneObservation, SceneObservation]]]:
    """Walk the corpus, run the pipeline against every (scene, capture),
    return ``(observations, pairs)`` ready for ``run_eval.run``.

    Per-item pipeline failures DO NOT abort the run — they produce a
    flagged SceneObservation with errors[] populated, so the eval rig can
    surface ``op_failure_rate`` honestly.
    """
    runner: PipelineRunner = pipeline_runner or default_pipeline_runner
    items = walk_corpus(corpora_dir)

    observations: list[SceneObservation] = []
    by_scene: dict[str, list[SceneObservation]] = {}
    for item in items:
        try:
            payload = build_intake_payload(item)
            obs = runner(item, payload)
        except Exception as exc:  # noqa: BLE001 — op_failure_rate must be honest
            logger.warning(
                "[corpus_walker] %s/%s: %s",
                item.scene_id,
                item.capture_id,
                exc,
                exc_info=True,
            )
            obs = _failed_observation(item, exc)
        observations.append(obs)
        by_scene.setdefault(item.scene_id, []).append(obs)

    pairs = _build_pairs(by_scene)
    return observations, pairs
