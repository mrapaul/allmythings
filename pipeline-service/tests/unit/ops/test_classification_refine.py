"""§3.12 classification_refine — Qwen-VL tier chain."""
from __future__ import annotations

import asyncio
import logging
from typing import Any
from unittest.mock import AsyncMock

import pytest

from pipeline_service.models.ollama_client import (
    OllamaClient,
    OllamaParseError,
    OllamaServerError,
    OllamaTimeout,
)
from pipeline_service.ops.classification_refine import classification_refine_impl
from pipeline_service.types import (
    BBox,
    PipelineConfig,
    PipelineDetection,
    SceneObservation,
)


def _scene(n: int) -> SceneObservation:
    obs = SceneObservation.empty(scene_id="s", run_id="r", frame_ids=["F0"])
    obs = obs.model_copy(
        update={
            "detections": [
                PipelineDetection(
                    id=f"d{i}",
                    bbox=BBox(x=0, y=0, width=1, height=1),
                    primaryLabel="lamp",
                )
                for i in range(n)
            ]
        }
    )
    return obs


@pytest.fixture
def mock_ollama() -> AsyncMock:
    return AsyncMock(spec=OllamaClient)


@pytest.mark.asyncio
async def test_empty_detections_makes_no_calls(mock_ollama) -> None:
    obs = _scene(0)
    out = await classification_refine_impl(obs, ollama=mock_ollama, config=PipelineConfig())
    assert out is obs or out.detections == []
    mock_ollama.generate.assert_not_called()


@pytest.mark.asyncio
async def test_happy_path_qwen7b_populates_attributes(mock_ollama) -> None:
    mock_ollama.generate.return_value = {
        "name": "Brass desk lamp",
        "category": "lighting",
        "color": "brass",
    }
    obs = _scene(1)
    out = await classification_refine_impl(obs, ollama=mock_ollama, config=PipelineConfig())
    assert out.detections[0].vlmStructuredAttributes == {
        "name": "Brass desk lamp",
        "category": "lighting",
        "color": "brass",
    }
    args = mock_ollama.generate.call_args
    assert args.kwargs["model"] == "qwen2.5vl:7b"


@pytest.mark.asyncio
async def test_tier_chain_falls_through_on_timeout_and_parse_error(mock_ollama) -> None:
    mock_ollama.generate.side_effect = [
        OllamaTimeout("qwen7b timeout"),
        OllamaParseError("qwen3b parse"),
        {"name": "OK from moondream"},
    ]
    obs = _scene(1)
    out = await classification_refine_impl(obs, ollama=mock_ollama, config=PipelineConfig())
    assert mock_ollama.generate.await_count == 3
    assert out.detections[0].vlmStructuredAttributes == {"name": "OK from moondream"}


@pytest.mark.asyncio
async def test_all_tiers_fail_yields_empty_dict_not_default(mock_ollama) -> None:
    mock_ollama.generate.side_effect = [
        OllamaServerError(500, "qwen7b 500"),
        OllamaTimeout("qwen3b timeout"),
        OllamaParseError("moondream parse"),
    ]
    obs = _scene(1)
    out = await classification_refine_impl(obs, ollama=mock_ollama, config=PipelineConfig())
    # Empty dict is the contract — NOT a default attribute set, NOT None.
    assert out.detections[0].vlmStructuredAttributes == {}


@pytest.mark.asyncio
async def test_parse_error_is_not_retried_within_tier(mock_ollama) -> None:
    """A single parse error in tier 1 must fall through to tier 2 immediately,
    not retry tier 1.
    """
    mock_ollama.generate.side_effect = [
        OllamaParseError("tier 1 parse"),
        {"name": "OK"},
    ]
    obs = _scene(1)
    await classification_refine_impl(obs, ollama=mock_ollama, config=PipelineConfig())
    assert mock_ollama.generate.await_count == 2


@pytest.mark.asyncio
async def test_classification_tier_forcing_skips_earlier_tiers(mock_ollama) -> None:
    mock_ollama.generate.return_value = {"name": "moondream"}
    cfg = PipelineConfig(classificationTierForcing="moondream")
    obs = _scene(1)
    await classification_refine_impl(obs, ollama=mock_ollama, config=cfg)
    args = mock_ollama.generate.call_args
    assert args.kwargs["model"] == "moondream"
    assert mock_ollama.generate.await_count == 1


@pytest.mark.asyncio
async def test_per_detection_call_count(mock_ollama) -> None:
    mock_ollama.generate.return_value = {"name": "x"}
    obs = _scene(3)
    await classification_refine_impl(obs, ollama=mock_ollama, config=PipelineConfig())
    assert mock_ollama.generate.await_count == 3


@pytest.mark.asyncio
async def test_log_redaction_applied(
    mock_ollama, caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The op must log VLM output via the redacting logger so attribute
    values never reach Loki."""
    monkeypatch.setenv("PIPELINE_LOG_REDACTION", "true")
    from pipeline_service import log_redaction

    target_logger = logging.getLogger("pipeline_service.ops.classification_refine")
    log_redaction.install_redactor(target_logger)
    mock_ollama.generate.return_value = {"name": "secret-text", "color": "blue"}
    obs = _scene(1)
    with caplog.at_level(logging.INFO, logger="pipeline_service"):
        await classification_refine_impl(obs, ollama=mock_ollama, config=PipelineConfig())
    formatted = " | ".join(r.getMessage() for r in caplog.records)
    assert "secret-text" not in formatted
    assert "blue" not in formatted
    # Structural marker present in at least one record.
    assert "len=" in formatted or "attr_keys=" in formatted


@pytest.mark.asyncio
async def test_image_bytes_threaded_through_to_ollama(mock_ollama) -> None:
    """The op must send the burst's first non-failed frame as JPEG to Ollama
    (parity with enrich-item.activity.ts:55 which passed input.imageBase64).
    Sending b"" silently breaks parity with a real model — regression for
    the section-03 review's MUST-FIX 1.
    """
    from datetime import datetime, timezone
    from io import BytesIO

    from PIL import Image
    import numpy as np

    from pipeline_service.types import Frame

    arr = np.full((4, 4, 3), 200, dtype=np.uint8)
    frame = Frame(
        frame_id="F0",
        rgb_bytes=arr.tobytes(),
        rgb_shape=(4, 4, 3),
        rgb_dtype="uint8",
        exif_orientation=1,
        captured_at=datetime.now(timezone.utc),
        decoding_failed=False,
    )
    failed_frame = Frame(
        frame_id="F-bad",
        rgb_bytes=b"",
        rgb_shape=(0, 0, 3),
        decoding_failed=True,
    )
    mock_ollama.generate.return_value = {"name": "x"}
    obs = _scene(1)
    await classification_refine_impl(
        obs,
        frames=[failed_frame, frame],
        ollama=mock_ollama,
        config=PipelineConfig(),
    )
    sent = mock_ollama.generate.call_args.kwargs["images"]
    assert isinstance(sent, list) and len(sent) == 1
    payload = sent[0]
    assert isinstance(payload, bytes) and len(payload) > 0, (
        "frame bytes must be threaded through; b'' breaks parity"
    )
    # Sanity: the payload should be a valid JPEG (Ollama expects this).
    Image.open(BytesIO(payload)).load()


@pytest.mark.asyncio
async def test_concurrent_calls_serialised_via_ollama_semaphore() -> None:
    """When two refine ops run concurrently against the SAME model, the real
    OllamaClient's per-model semaphore must serialise them. We use a fake
    OllamaClient that mimics the semaphore behaviour and assert peak in-flight
    is 1.
    """
    in_flight = 0
    peak = 0
    sem = asyncio.Semaphore(1)

    async def fake_generate(**_kwargs: Any) -> dict[str, Any]:
        nonlocal in_flight, peak
        async with sem:
            in_flight += 1
            peak = max(peak, in_flight)
            await asyncio.sleep(0.01)
            in_flight -= 1
            return {"name": "x"}

    fake = AsyncMock(spec=OllamaClient)
    fake.generate.side_effect = fake_generate

    obs_a = _scene(2)
    obs_b = _scene(2)
    cfg = PipelineConfig()
    await asyncio.gather(
        classification_refine_impl(obs_a, ollama=fake, config=cfg),
        classification_refine_impl(obs_b, ollama=fake, config=cfg),
    )
    assert peak == 1
