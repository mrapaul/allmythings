"""Dagster ``Definitions`` for the pipeline service.

The DAG mirrors §1 of claude-plan.md:

    frame_intake (list[Frame]) → scene_embedding
      → vlm_prompt_expansion
      → florence_detect, grounding_dino_detect (parallel)
      → sahi_recovery → effsam_segment
      → box_fusion → crop_embedding
      → cross_pass_dedup → cross_frame_dedup
      → classification_refine → agreement_scoring
      → self_diagnosis (DynamicOut, fan-out in same DAG)
      → assemble_result

Section-01 ships the full graph with frame_intake + assemble_result as
real ops and the 13 middle ops as typed pass-through stubs. Execution is
in-process via ``job.execute_in_process()`` invoked by the FastAPI sidecar.

This module is the *single* place where Dagster ``@op`` decorators wrap
the ``*_impl`` callables in ``pipeline_service.ops.*``. Keeping the
decorators here avoids op-name collisions and lets the graph-only
plumbing (run-config decoding, DynamicOut conversion, fan-in helpers)
live alongside the wiring.
"""
from __future__ import annotations

from typing import Any

from dagster import (
    Definitions,
    DynamicOut,
    DynamicOutput,
    Field,
    In,
    Out,
    job,
    op,
)

from pipeline_service.ops.agreement_scoring import agreement_scoring_impl
from pipeline_service.ops.assemble_result import assemble_result_impl
from pipeline_service.ops.box_fusion import box_fusion_impl
from pipeline_service.ops.classification_refine import classification_refine_impl
from pipeline_service.ops.crop_embedding import crop_embedding_impl
from pipeline_service.ops.cross_frame_dedup import cross_frame_dedup_impl
from pipeline_service.ops.cross_pass_dedup import cross_pass_dedup_impl
from pipeline_service.ops.effsam_segment import effsam_segment_impl
from pipeline_service.ops.florence_detect import florence_detect_impl
from pipeline_service.ops.frame_intake import frame_intake_impl
from pipeline_service.ops.grounding_dino_detect import grounding_dino_detect_impl
from pipeline_service.ops.sahi_recovery import sahi_recovery_impl
from pipeline_service.ops.scene_embedding import scene_embedding_impl
from pipeline_service.ops.self_diagnosis import self_diagnosis_impl
from pipeline_service.ops.vlm_prompt_expansion import vlm_prompt_expansion_impl
from pipeline_service.storage.retention import (
    prune_runs_job,
    prune_runs_schedule,
)
from pipeline_service.types import (
    DedupedFrame,
    EmbeddedFrame,
    Frame,
    FrameDetections,
    FusedFrame,
    PromptList,
    SceneEmbedding,
    SceneObservation,
)


_STUB_METADATA = {"op_stubbed": True, "section": "01"}


def _run_async(coro):
    """Run an async coroutine from sync context, picking a strategy that
    works whether or not an event loop is already active.
    """
    import asyncio

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    # If a loop is already running (e.g., Dagster's async-execution variants
    # or test harnesses), schedule on it and block on the future.
    fut = asyncio.run_coroutine_threadsafe(coro, loop)
    return fut.result()


# ---------- Real ops ----------------------------------------------------------

@op(
    name="frame_intake",
    config_schema={
        "frames": Field(
            list,
            description=(
                "List of frame dicts: {frame_id, sha256, mime_type, "
                "photo_bytes_hex (optional, hex-encoded bytes)}"
            ),
        ),
    },
    out=Out(list, description="Decoded Frame records"),
    description="§3.1 frame_intake — decode + EXIF strip + persist.",
)
def frame_intake_op(context) -> list[Frame]:
    raw_frames = context.op_config["frames"]
    payload = []
    for fr in raw_frames:
        photo_bytes = fr.get("photo_bytes")
        if photo_bytes is None and "photo_bytes_hex" in fr:
            photo_bytes = bytes.fromhex(fr["photo_bytes_hex"])
        payload.append(
            {
                "frame_id": fr["frame_id"],
                "sha256": fr["sha256"],
                "mime_type": fr.get("mime_type", "image/jpeg"),
                "photo_bytes": photo_bytes,
            }
        )
    return frame_intake_impl(payload)


def select_terminal_branch(
    observation_branches: list[SceneObservation],
) -> SceneObservation:
    """Deterministic branch selection: pick the deepest ``rerunDepth``, then
    the highest ``agreementCoverage``, then lexicographic ``sceneId``.

    Stable under any DynamicOutput ordering Dagster may emit (mapping-key
    order is unspecified). Section-07 will rely on this when self_diagnosis
    actually fans out; today it ensures section-01's single-branch case
    behaves the same.
    """
    if not observation_branches:
        raise ValueError("select_terminal_branch requires at least one branch")
    return max(
        observation_branches,
        key=lambda obs: (
            obs.rerunDepth,
            obs.agreementCoverage,
            obs.sceneId,
        ),
    )


@op(
    name="assemble_result",
    ins={"observation_branches": In(list)},
    out=Out(dict),
    description="§3.15 assemble_result — collects DynamicOut branches.",
)
def assemble_result_op(
    context,
    observation_branches: list[SceneObservation],
) -> dict[str, Any]:
    import time as _time

    tags = getattr(context.run, "tags", {}) or {}
    if not observation_branches:
        empty = SceneObservation.empty(
            scene_id=tags.get("sceneId", ""),
            run_id=context.run.run_id,
            frame_ids=[],
        )
        return assemble_result_impl(empty, started_ms=0, finished_ms=0)

    chosen = select_terminal_branch(observation_branches)

    # processingMs is the wall-time delta between the run starting and now.
    # The sidecar tags the run with ``pipelineStartedMs`` (epoch ms); section-07
    # tests pin it explicitly. Falling back to 0 keeps replay-fixture tests
    # byte-stable while still producing real numbers in production runs.
    started = int(tags.get("pipelineStartedMs", "0"))
    finished = int(_time.time() * 1000) if started else 0
    return assemble_result_impl(chosen, started_ms=started, finished_ms=finished)


# ---------- Stub ops (pass-through, op_stubbed=True metadata) -----------------

@op(name="scene_embedding", out=Out(list, description="§3.2 — DINOv2 ViT-B/14"))
def scene_embedding_op(frames: list[Frame]) -> list[SceneEmbedding]:
    return scene_embedding_impl(frames)


@op(
    name="vlm_prompt_expansion",
    out=Out(PromptList, description="§3.3 — two-seed expansion + cache"),
)
def vlm_prompt_expansion_op(
    frames: list[Frame],
    embeddings: list[SceneEmbedding],
    florence_detections: list[FrameDetections],
) -> PromptList:
    return _run_async(
        vlm_prompt_expansion_impl(
            frames, embeddings, florence_detections=florence_detections
        )
    )


@op(
    name="florence_detect",
    out=Out(list, description="§3.4 — Florence HTTP shim"),
)
def florence_detect_op(frames: list[Frame]) -> list[FrameDetections]:
    return _run_async(florence_detect_impl(frames))


@op(name="grounding_dino_detect", out=Out(list, description="§3.5 — gdino"))
def grounding_dino_detect_op(
    frames: list[Frame],
    prompts: PromptList,
) -> list[FrameDetections]:
    return grounding_dino_detect_impl(frames, prompts)


@op(name="sahi_recovery", out=Out(list, description="§3.6 — tiled re-detect"))
def sahi_recovery_op(
    frames: list[Frame],
    per_detector_detections: list[FrameDetections],
    prompts: PromptList,
) -> list[FrameDetections]:
    return sahi_recovery_impl(
        frames, per_detector_detections, prompts=prompts
    )


@op(name="effsam_segment", out=Out(list, description="§3.7 — masks"))
def effsam_segment_op(
    frames: list[Frame],
    fused_frames: list[FusedFrame],
) -> list:
    return effsam_segment_impl(frames, fused_frames)


@op(name="box_fusion", out=Out(list, description="§3.8 — WBF"))
def box_fusion_op(
    per_frame_detections: list[FrameDetections],
) -> list[FusedFrame]:
    return box_fusion_impl(per_frame_detections)


@op(name="crop_embedding", out=Out(list, description="§3.9 — DINOv2 crops"))
def crop_embedding_op(
    fused_frames: list[FusedFrame],
    frames: list[Frame],
) -> list[EmbeddedFrame]:
    by_id = {fr.frame_id: fr for fr in frames}
    return [
        crop_embedding_impl(by_id.get(ff.frame_id, frames[0] if frames else None), ff)  # type: ignore[arg-type]
        for ff in sorted(fused_frames, key=lambda f: f.frame_id)
        if by_id.get(ff.frame_id) is not None
    ]


@op(name="cross_pass_dedup", out=Out(list, description="§3.10 — within-frame dedup"))
def cross_pass_dedup_op(
    fused_frames: list[FusedFrame],
    embedded_frames: list[EmbeddedFrame],
) -> list[DedupedFrame]:
    embed_by_frame = {ef.frame_id: ef for ef in embedded_frames}
    return [
        cross_pass_dedup_impl(
            fused_frame=ff,
            embedded_frame=embed_by_frame.get(
                ff.frame_id, EmbeddedFrame(frame_id=ff.frame_id)
            ),
        )
        for ff in sorted(fused_frames, key=lambda f: f.frame_id)
    ]


@op(
    name="cross_frame_dedup",
    out=Out(SceneObservation, description="§3.11 — across-burst dedup"),
)
def cross_frame_dedup_op(
    context,
    deduped_frames: list[DedupedFrame],
    embedded_frames: list[EmbeddedFrame],
) -> SceneObservation:
    tags = getattr(context.run, "tags", {}) or {}
    return cross_frame_dedup_impl(
        deduped_frames=deduped_frames,
        embedded_frames=embedded_frames,
        scene_id=tags.get("sceneId", "scene-stub"),
        run_id=tags.get("requestId", context.run.run_id),
    )


@op(
    name="classification_refine",
    ins={"observation": In(SceneObservation), "frames": In(list)},
    out=Out(SceneObservation, description="§3.12 — Qwen-VL tier chain"),
)
def classification_refine_op(
    observation: SceneObservation,
    frames: list[Frame],
) -> SceneObservation:
    return _run_async(classification_refine_impl(observation, frames=frames))


@op(
    name="agreement_scoring",
    ins={"observation": In(SceneObservation)},
    out=Out(SceneObservation, description="§3.13 — agreement scoring + flags"),
)
def agreement_scoring_op(observation: SceneObservation) -> SceneObservation:
    return agreement_scoring_impl(observation)


@op(
    name="self_diagnosis",
    ins={"observation": In(SceneObservation)},
    out=DynamicOut(SceneObservation),
    description="§3.14 — DynamicOut fan-out per strictness ladder.",
)
def self_diagnosis_op(observation: SceneObservation):
    for item in self_diagnosis_impl(observation, rerun_depth=observation.rerunDepth):
        if isinstance(item, tuple):
            mapping_key, terminal_obs, _directive = item
            yield DynamicOutput(terminal_obs, mapping_key=mapping_key)
        else:
            yield DynamicOutput(item, mapping_key="terminal")


# ---------- Graph plumbing ----------------------------------------------------

@op(name="concat_first_pass", out=Out(list))
def _concat_first_pass(
    florence: list,
    gdino: list,
) -> list:
    return list(florence) + list(gdino)


@op(name="concat_first_pass_and_sahi", out=Out(list))
def _concat_detections(
    florence: list,
    gdino: list,
    sahi: list,
) -> list:
    return list(florence) + list(gdino) + list(sahi)


# ---------- The graph / job ---------------------------------------------------

@job(name="pipeline_job")
def pipeline_job() -> None:
    frames = frame_intake_op()
    embeddings = scene_embedding_op(frames)
    florence = florence_detect_op(frames)
    prompts = vlm_prompt_expansion_op(frames, embeddings, florence)
    gdino = grounding_dino_detect_op(frames, prompts)
    first_pass = _concat_first_pass(florence, gdino)
    sahi = sahi_recovery_op(frames, first_pass, prompts)
    all_dets = _concat_detections(florence, gdino, sahi)
    fused_frames = box_fusion_op(all_dets)
    effsam_segment_op(frames, fused_frames)
    embedded_frames = crop_embedding_op(fused_frames, frames)
    deduped = cross_pass_dedup_op(fused_frames, embedded_frames)
    scene = cross_frame_dedup_op(deduped, embedded_frames)
    refined = classification_refine_op(scene, frames)
    scored = agreement_scoring_op(refined)
    branches = self_diagnosis_op(scored)
    collected = branches.collect()
    assemble_result_op(collected)


# ---------- Definitions -------------------------------------------------------

defs = Definitions(
    jobs=[pipeline_job, prune_runs_job],
    schedules=[prune_runs_schedule],
)
