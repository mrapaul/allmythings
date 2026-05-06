"""§3.3 vlm_prompt_expansion — two-seed expansion + cache w/ bypass."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import numpy as np
import pytest

from pipeline_service.models.ollama_client import OllamaClient, OllamaServerError
from pipeline_service.ops.vlm_prompt_expansion import vlm_prompt_expansion_impl
from pipeline_service.storage.prompt_cache import PromptCache, cache_key_for
from pipeline_service.types import (
    BBox,
    Frame,
    FrameDetections,
    PromptList,
    RawDetection,
    SceneEmbedding,
)


def _frame(frame_id: str, colour: int = 100) -> Frame:
    arr = np.full((8, 8, 3), colour, dtype=np.uint8)
    return Frame(
        frame_id=frame_id,
        rgb_bytes=arr.tobytes(),
        rgb_shape=(8, 8, 3),
        rgb_dtype="uint8",
        exif_orientation=1,
        captured_at=datetime.now(timezone.utc),
        decoding_failed=False,
    )


def _emb(frame_id: str, seed: int = 0, failed: bool = False) -> SceneEmbedding:
    rng = np.random.default_rng(seed)
    vec = rng.standard_normal(768).astype(np.float16)
    norm = np.linalg.norm(vec.astype(np.float32))
    vec = (vec / max(norm, 1e-9)).astype(np.float16)
    if failed:
        vec = np.zeros(768, dtype=np.float16)
    return SceneEmbedding(
        frame_id=frame_id,
        vector_bytes=vec.tobytes(),
        embedded_at=datetime.now(timezone.utc),
        embedding_failed=failed,
    )


def _flo(frame_id: str, captions: list[str]) -> FrameDetections:
    return FrameDetections(
        detector="florence",
        frame_id=frame_id,
        detections=[
            RawDetection(
                detector="florence",
                frame_id=frame_id,
                bbox=BBox(x=0, y=0, width=1, height=1),
                label=cap,
                raw_confidence=None,
            )
            for cap in captions
        ],
        detector_error=False,
    )


@pytest.fixture
def mock_ollama() -> AsyncMock:
    return AsyncMock(spec=OllamaClient)


@pytest.fixture
def cache() -> PromptCache:
    return PromptCache()


@pytest.mark.asyncio
async def test_cache_hit_returns_cached_no_live_calls(mock_ollama, cache) -> None:
    frames = [_frame("F0"), _frame("F1"), _frame("F2")]
    embeddings = [_emb("F0", seed=1), _emb("F1", seed=2), _emb("F2", seed=3)]
    vectors = [np.frombuffer(e.vector_bytes, dtype=np.float16) for e in embeddings]
    key = cache_key_for(vectors)
    cache.set(
        key,
        PromptList(
            prompts=["lamp", "chair"],
            cached=False,
            source_models=["qwen2.5vl:7b", "florence-2"],
            degraded=False,
        ),
    )
    out = await vlm_prompt_expansion_impl(
        frames, embeddings, ollama=mock_ollama, cache=cache, florence_detections=[]
    )
    assert out.cached is True
    assert out.prompts == ["lamp", "chair"]
    mock_ollama.generate.assert_not_called()


@pytest.mark.asyncio
async def test_cache_miss_runs_both_seeds_returns_union(mock_ollama, cache) -> None:
    mock_ollama.generate.return_value = {"prompts": ["lamp", "chair", "rug"]}
    flos = [_flo("F0", ["sofa", "lamp"]), _flo("F1", ["coffee table"])]
    out = await vlm_prompt_expansion_impl(
        [_frame("F0"), _frame("F1")],
        [_emb("F0", 1), _emb("F1", 2)],
        ollama=mock_ollama,
        cache=cache,
        florence_detections=flos,
    )
    assert out.cached is False
    assert set(out.source_models) == {"qwen2.5vl:3b", "florence-2"}
    # Union of Qwen + Florence captions, sanitised + sorted.
    assert "lamp" in out.prompts
    assert "sofa" in out.prompts
    assert "rug" in out.prompts
    assert out.prompts == sorted(out.prompts)
    # Cache populated post-call.
    assert len(cache) == 1


@pytest.mark.asyncio
async def test_cache_bypass_when_any_embedding_failed(mock_ollama, cache) -> None:
    """REGRESSION: zero-vector collision bug — when any embedding failed,
    the cache MUST NOT be consulted (otherwise all failed scenes alias onto
    the same cached prompt list).
    """
    mock_ollama.generate.return_value = {"prompts": ["lamp"]}
    bypass_emb = [_emb("F0", failed=True), _emb("F1", 2), _emb("F2", 3)]
    # Pre-poison the cache: any cached entry must NOT be returned because
    # the bypass triggers.
    cache.set(
        "anything",
        PromptList(prompts=["POISON"], cached=False, source_models=[], degraded=False),
    )
    spy = cache.get
    cache.get = lambda *a, **k: (_ for _ in ()).throw(  # type: ignore[assignment]
        AssertionError(f"cache.get must NOT be called on bypass path: {a, k}")
    )
    try:
        out = await vlm_prompt_expansion_impl(
            [_frame("F0"), _frame("F1"), _frame("F2")],
            bypass_emb,
            ollama=mock_ollama,
            cache=cache,
            florence_detections=[],
        )
    finally:
        cache.get = spy  # type: ignore[assignment]
    assert "POISON" not in out.prompts
    assert out.cached is False


@pytest.mark.asyncio
async def test_qwen_fail_florence_success(mock_ollama, cache) -> None:
    mock_ollama.generate.side_effect = OllamaServerError(500, "qwen down")
    out = await vlm_prompt_expansion_impl(
        [_frame("F0")],
        [_emb("F0", 1)],
        ollama=mock_ollama,
        cache=cache,
        florence_detections=[_flo("F0", ["sofa"])],
    )
    # Florence contributed; no hardcoded fallback — scene-specific only.
    assert out.source_models == ["florence-2"]
    assert out.degraded is False
    assert "sofa" in out.prompts


@pytest.mark.asyncio
async def test_qwen_3b_fails_falls_through_to_7b(mock_ollama, cache) -> None:
    """3B is the default tier (fits alongside Florence + Grounding DINO
    on MPS); if 3B parses incorrectly, 7B is the upgrade fallback —
    must not silently degrade to florence-only."""
    mock_ollama.generate.side_effect = [
        OllamaServerError(500, "qwen 3b crashed"),
        {"prompts": ["pillow", "rug", "blanket"]},
    ]
    out = await vlm_prompt_expansion_impl(
        [_frame("F0")],
        [_emb("F0", 1)],
        ollama=mock_ollama,
        cache=cache,
        florence_detections=[],
    )
    assert "qwen2.5vl:3b" in out.source_models  # canonical tier name reported
    assert out.degraded is False
    for word in ("pillow", "rug", "blanket"):
        assert word in out.prompts
    # 3B was tried first then 7B — two ollama calls.
    assert mock_ollama.generate.await_count == 2


@pytest.mark.asyncio
async def test_qwen_calls_pass_keep_alive_zero(mock_ollama, cache) -> None:
    """Qwen-VL prompt-expansion calls must pass keep_alive=0 so Ollama
    unloads the model right after the response — frees MPS memory for
    the next pipeline stage (Grounding DINO + SAHI). Without this the
    Florence + Grounding DINO + Qwen-VL stack OOMs on MPS and Ollama
    falls back to CPU with a 35 GiB compute graph."""
    mock_ollama.generate.return_value = {"prompts": ["chair"]}
    await vlm_prompt_expansion_impl(
        [_frame("F0")],
        [_emb("F0", 1)],
        ollama=mock_ollama,
        cache=cache,
        florence_detections=[],
    )
    call = mock_ollama.generate.call_args
    assert call.kwargs.get("keep_alive") == 0


@pytest.mark.asyncio
async def test_florence_caption_split_on_preposition(mock_ollama, cache) -> None:
    """Verbose Florence captions like "marble coffee table in living room"
    contribute their head noun-phrase ("marble coffee table") AND their
    full form (now under the relaxed 8-token cap) to the prompt list.
    Grounding DINO accepts multi-word phrases as a single category."""
    mock_ollama.generate.side_effect = OllamaServerError(500, "qwen down")
    out = await vlm_prompt_expansion_impl(
        [_frame("F0")],
        [_emb("F0", 1)],
        ollama=mock_ollama,
        cache=cache,
        florence_detections=[
            _flo("F0", [
                "marble coffee table in living room",
                "marble round side table with black metal base",
            ]),
        ],
    )
    assert out.degraded is False
    assert "marble coffee table" in out.prompts
    assert "marble round side table" in out.prompts


@pytest.mark.asyncio
async def test_both_seeds_fail_returns_degraded(mock_ollama, cache) -> None:
    """Scene-specific seeds (Qwen, Florence) both empty → degraded=True
    AND empty prompt list. We deliberately do NOT seed a hardcoded
    household-objects fallback: that produced hallucinated detections
    (e.g. "brass table lamp", "wall mirror") in scenes that didn't
    contain those items. An empty prompt list lets Grounding DINO + SAHI
    no-op for this burst, which is the honest signal."""
    mock_ollama.generate.side_effect = OllamaServerError(500, "down")
    out = await vlm_prompt_expansion_impl(
        [_frame("F0")],
        [_emb("F0", 1)],
        ollama=mock_ollama,
        cache=cache,
        florence_detections=[],
    )
    assert out.degraded is True
    assert out.source_models == []
    assert out.prompts == []


@pytest.mark.asyncio
async def test_sanitisation_lowercases_dedupes_caps_at_M(mock_ollama, cache) -> None:
    raw = "\n".join(
        [f"Item Number {i}" for i in range(120)]
        + ["LAMP", "lamp", " lamp", ""]
    )
    mock_ollama.generate.return_value = {"prompts": raw}
    out = await vlm_prompt_expansion_impl(
        [_frame("F0")],
        [_emb("F0", 1)],
        ollama=mock_ollama,
        cache=cache,
        florence_detections=[],
        max_prompts=80,
    )
    assert len(out.prompts) <= 80
    # Lowercased + dedup: only one "lamp".
    assert out.prompts.count("lamp") <= 1
    # Empties dropped.
    assert "" not in out.prompts


@pytest.mark.asyncio
async def test_log_redaction_applied(
    mock_ollama, cache, caplog: pytest.LogCaptureFixture, monkeypatch
) -> None:
    monkeypatch.setenv("PIPELINE_LOG_REDACTION", "true")
    from pipeline_service import log_redaction

    log_redaction.install_redactor(
        logging.getLogger("pipeline_service.ops.vlm_prompt_expansion")
    )
    mock_ollama.generate.return_value = {"prompts": "secret-leaked\nrug"}
    with caplog.at_level(logging.INFO, logger="pipeline_service"):
        await vlm_prompt_expansion_impl(
            [_frame("F0")],
            [_emb("F0", 1)],
            ollama=mock_ollama,
            cache=cache,
            florence_detections=[],
        )
    formatted = " | ".join(r.getMessage() for r in caplog.records)
    assert "secret-leaked" not in formatted
    # Structural marker should be present once the redactor fired.
    assert "len=" in formatted or "sample_first_3=" in formatted


@pytest.mark.asyncio
async def test_empty_frames_returns_degraded(mock_ollama, cache) -> None:
    out = await vlm_prompt_expansion_impl(
        [], [], ollama=mock_ollama, cache=cache, florence_detections=[]
    )
    assert out.degraded is True
    assert out.prompts == []
    mock_ollama.generate.assert_not_called()
