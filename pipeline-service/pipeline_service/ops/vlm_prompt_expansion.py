"""§3.3 vlm_prompt_expansion — REAL op.

Two-seed prompt expansion (Qwen-VL + Florence captions) with a
scene-embedding-keyed cache and an explicit cache-bypass on
``embedding_failed`` (regression for the zero-vector collision bug).
"""
from __future__ import annotations

import asyncio
import logging
from io import BytesIO
from typing import Any, Iterable, Optional

import numpy as np

from pipeline_service.models.ollama_client import (
    OllamaClient,
    OllamaError,
)
from pipeline_service.storage.prompt_cache import (
    PromptCache,
    cache_key_for,
    get_global_cache,
)
from pipeline_service.types import (
    Frame,
    FrameDetections,
    PromptList,
    SceneEmbedding,
)

logger = logging.getLogger("pipeline_service.ops.vlm_prompt_expansion")

_PROMPT_EXPANSION_TEMPLATE = (
    "Look at this room photo. List every kind of household object that is "
    "visible OR likely to be visible in similar photos. Return one "
    "noun-phrase per line, lowercase, no commentary."
)

_DEFAULT_MAX_PROMPTS = 80
# Per-prompt token cap. Florence's dense-region captions are sometimes
# verbose ("marble coffee table"); Grounding DINO accepts multi-word
# phrases as a single category, so we let up to 8 tokens through. Above
# that, the caption is almost always a scene description rather than an
# object name (e.g. "living room with sheer curtains and blue blanket")
# and the head-phrase splitter (_split_florence_caption) extracts the
# object portion separately.
_DEFAULT_MAX_TOKENS_PER_PROMPT = 8
# Tier order: 3B first (fits in MPS alongside Florence + Grounding DINO),
# 7B as upgrade target when memory permits. The 3B-first default avoids
# the OOM-on-7B-then-fall-through latency penalty under typical load.
_QWEN_MODELS_BY_PREFERENCE: tuple[str, ...] = ("qwen2.5vl:3b", "qwen2.5vl:7b")
_QWEN_MODEL = _QWEN_MODELS_BY_PREFERENCE[0]  # kept for tests asserting the default
_FLORENCE_SOURCE = "florence-2"

# Conjunctions/prepositions used to split a verbose Florence caption like
# "marble coffee table in living room" into a head noun-phrase ("marble
# coffee table") and a context tail ("living room"). Both halves become
# Grounding DINO prompts; the head phrase is the object query, the tail
# is sometimes a useful scene anchor.
_FLORENCE_HEAD_SPLIT_TOKENS: tuple[str, ...] = (
    " in ", " with ", " on ", " of ", " at ", " by ", " near ",
    " under ", " above ", " behind ", " between ",
)


def _frame_jpeg(frame: Frame) -> bytes:
    if frame.decoding_failed or not frame.rgb_bytes:
        return b""
    arr = np.frombuffer(frame.rgb_bytes, dtype=frame.rgb_dtype).reshape(frame.rgb_shape)
    from PIL import Image

    img = Image.fromarray(arr)
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _select_median_frame_jpeg(
    frames: list[Frame], embeddings: list[SceneEmbedding]
) -> bytes:
    if not frames:
        return b""
    if len(frames) == 1:
        return _frame_jpeg(frames[0])
    # Match frames to embeddings by frame_id when available; fallback to index.
    by_id = {f.frame_id: f for f in frames}
    vecs = []
    keys = []
    for emb in embeddings:
        if emb.embedding_failed:
            continue
        v = np.frombuffer(emb.vector_bytes, dtype=np.float16)
        vecs.append(v.astype(np.float32))
        keys.append(emb.frame_id)
    if not vecs:
        return _frame_jpeg(frames[0])
    arr = np.stack(vecs)
    dists = np.sum(np.linalg.norm(arr[:, None, :] - arr[None, :, :], axis=-1), axis=1)
    idx = int(np.argmin(dists))
    chosen_id = keys[idx]
    return _frame_jpeg(by_id.get(chosen_id, frames[0]))


def _sanitise(items: Iterable[str], max_tokens: int, cap: int) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in items:
        if not isinstance(raw, str):
            continue
        for line in raw.split("\n"):
            t = line.strip().lower()
            if not t:
                continue
            if len(t.split()) > max_tokens:
                continue
            if t in seen:
                continue
            seen.add(t)
            out.append(t)
    out.sort()
    return out[:cap]


def _qwen_response_to_lines(payload: Any) -> list[str]:
    if isinstance(payload, dict):
        prompts = payload.get("prompts")
        if isinstance(prompts, list):
            return [str(x) for x in prompts]
        if isinstance(prompts, str):
            return [prompts]
        # Fall back to any string-valued field that looks like content.
        for v in payload.values():
            if isinstance(v, str):
                return [v]
    if isinstance(payload, list):
        return [str(x) for x in payload]
    if isinstance(payload, str):
        return [payload]
    return []


async def _seed_qwen(
    ollama: OllamaClient,
    image_bytes: bytes,
) -> Optional[list[str]]:
    """Try each Qwen-VL tier in order; first non-empty result wins.

    3B is the default tier (fits alongside Florence + Grounding DINO on
    MPS). 7B is tried as a quality upgrade only after 3B succeeds — the
    other way around the 7B OOM bursts cost ~30s per call.

    ``keep_alive=0`` is passed so Ollama unloads the model immediately
    after the response; downstream Florence / Grounding DINO need the
    Metal allocation back, and the next prompt-expansion call (next
    burst) re-loads in ~1s anyway. This is the fix for the "compute
    graph 35 GiB on CPU" failure mode where Ollama falls back to CPU
    when MPS is fragmented.
    """
    for model in _QWEN_MODELS_BY_PREFERENCE:
        try:
            payload = await ollama.generate(
                model=model,
                prompt=_PROMPT_EXPANSION_TEMPLATE,
                images=[image_bytes],
                format="json",
                keep_alive=0,
                # Prompt EXPANSION wants diversity in the suggested
                # noun-phrase list (different runs can legitimately
                # surface different objects to look for). temperature
                # 0.0 collapses the list. Override the format=json
                # default with a small but non-zero value here while
                # classification_refine inherits the deterministic
                # default for structured attribute extraction.
                options={"num_ctx": 4096, "temperature": 0.2},
            )
            lines = _qwen_response_to_lines(payload)
            if lines:
                return lines
        except OllamaError as exc:
            logger.warning("qwen seed (%s) failed: %s", model, exc)
            continue
    return None


def _split_florence_caption(caption: str) -> list[str]:
    """Extract head noun-phrases from a verbose Florence caption.

    Florence-2's dense-region head emits captions that mix the object
    with its scene context: "marble coffee table in living room". The
    sanitiser drops anything > 4 tokens, so passing the raw caption
    starves Grounding DINO of prompts. Split on the leading preposition
    /conjunction so the object phrase ("marble coffee table") survives,
    and emit the trailing scene phrase too — both are useful prompts
    for the open-vocabulary detector.
    """
    if not caption:
        return []
    s = caption.strip()
    if not s:
        return []
    out: list[str] = [s]
    lower = s.lower()
    for tok in _FLORENCE_HEAD_SPLIT_TOKENS:
        idx = lower.find(tok)
        if idx > 0:
            head = s[:idx].strip()
            tail = s[idx + len(tok):].strip()
            if head:
                out.append(head)
            if tail:
                out.append(tail)
            break  # only split on the first preposition; captions rarely have two
    return out


def _seed_florence(detections: list[FrameDetections]) -> list[str]:
    out: list[str] = []
    for fd in detections:
        if fd.detector_error:
            continue
        for det in fd.detections:
            if det.label:
                out.extend(_split_florence_caption(det.label))
    return out


async def vlm_prompt_expansion_impl(
    frames: list[Frame],
    scene_embeddings: list[SceneEmbedding],
    *,
    ollama: Optional[OllamaClient] = None,
    cache: Optional[PromptCache] = None,
    florence_detections: Optional[list[FrameDetections]] = None,
    max_prompts: int = _DEFAULT_MAX_PROMPTS,
    max_tokens_per_prompt: int = _DEFAULT_MAX_TOKENS_PER_PROMPT,
) -> PromptList:
    if not frames:
        logger.info("vlm_prompt_expansion called with no frames; returning degraded")
        return PromptList(prompts=[], cached=False, source_models=[], degraded=True)

    flos = florence_detections or []
    # NOTE: empty PromptCache is falsy (it defines __len__) — use explicit
    # is-None check, NOT `or`, to preserve the caller's instance.
    cache = cache if cache is not None else get_global_cache()
    client = ollama or OllamaClient()

    has_failed_embedding = any(se.embedding_failed for se in scene_embeddings)

    # --- bypass path -----------------------------------------------------------
    if has_failed_embedding:
        logger.info("vlm_prompt_expansion bypassing cache (embedding_failed)")
        return await _live_run(
            frames=frames,
            embeddings=scene_embeddings,
            ollama=client,
            florence_detections=flos,
            max_prompts=max_prompts,
            max_tokens_per_prompt=max_tokens_per_prompt,
            cache=None,
        )

    # --- cache path ------------------------------------------------------------
    vectors = [
        np.frombuffer(se.vector_bytes, dtype=np.float16)
        for se in scene_embeddings
        if not se.embedding_failed
    ]
    key = cache_key_for(vectors)
    cached = cache.get(key)
    if cached is not None:
        logger.info("vlm_prompt_expansion cache hit", extra={"_redact": True, "prompts": cached.prompts})
        return cached.model_copy(update={"cached": True})

    return await _live_run(
        frames=frames,
        embeddings=scene_embeddings,
        ollama=client,
        florence_detections=flos,
        max_prompts=max_prompts,
        max_tokens_per_prompt=max_tokens_per_prompt,
        cache=cache,
        cache_key=key,
    )


async def _live_run(
    *,
    frames: list[Frame],
    embeddings: list[SceneEmbedding],
    ollama: OllamaClient,
    florence_detections: list[FrameDetections],
    max_prompts: int,
    max_tokens_per_prompt: int,
    cache: Optional[PromptCache],
    cache_key: Optional[str] = None,
) -> PromptList:
    image_bytes = _select_median_frame_jpeg(frames, embeddings)

    qwen_task = asyncio.create_task(_seed_qwen(ollama, image_bytes))
    florence_lines = _seed_florence(florence_detections)
    qwen_lines = await qwen_task

    source_models: list[str] = []
    pool: list[str] = []
    if qwen_lines is not None:
        source_models.append(_QWEN_MODEL)
        pool.extend(qwen_lines)
    if florence_lines:
        source_models.append(_FLORENCE_SOURCE)
        pool.extend(florence_lines)

    sanitised = _sanitise(pool, max_tokens=max_tokens_per_prompt, cap=max_prompts)
    # Degraded means the run had no scene-specific signal at all. The
    # downstream Grounding DINO / SAHI ops handle empty PromptList
    # gracefully (no detections recovered) — far better than poisoning
    # the pipeline with hardcoded household guesses that cause
    # hallucinations like "brass table lamp" or "wall mirror" in scenes
    # where neither exists.
    degraded = len(source_models) == 0
    result = PromptList(
        prompts=sanitised,
        cached=False,
        source_models=source_models,
        degraded=degraded,
    )

    logger.info(
        "vlm_prompt_expansion completed",
        extra={
            "_redact": True,
            "prompts": sanitised,
            "source_models": source_models,
            "cached": False,
            "degraded": degraded,
        },
    )

    if cache is not None and cache_key is not None and not degraded:
        cache.set(cache_key, result)
    return result
