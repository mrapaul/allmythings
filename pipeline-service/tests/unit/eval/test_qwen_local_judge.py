"""Behaviour pins for ``QwenLocalJudge``.

Wraps the existing async ``OllamaClient``. Forces JSON-shape verdicts
via ``format='json'``. 1.5x RoI expansion before sending bytes upstream.
Uniform failure-degradation contract: any transport, parse, or shape
error becomes ``"unsure"`` — never raised.
"""
from __future__ import annotations

import io
import json

import pytest
from PIL import Image

from pipeline_service.eval.gt_eval.judges.qwen_local import QwenLocalJudge


def _solid_jpeg(size: tuple[int, int]) -> bytes:
    """Build a deterministic solid-colour JPEG of the given size."""
    img = Image.new("RGB", size, color=(120, 60, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92)
    return buf.getvalue()


async def test_prompt_body_includes_json_shape_and_label(
    mock_ollama_client,
) -> None:
    """Prompt must contain literal ``'{"verdict":'`` and the label string."""
    judge = QwenLocalJudge(client=mock_ollama_client)
    await judge.verify(_solid_jpeg((40, 40)), label="coffee table")
    prompt_sent = mock_ollama_client.last_call_kwargs["prompt"]
    assert '{"verdict":' in prompt_sent
    assert "coffee table" in prompt_sent


async def test_roi_expansion_is_1_5x(mock_ollama_client) -> None:
    """Crop bytes uploaded to Ollama represent a 1.5×-expanded image."""
    src = _solid_jpeg((100, 100))
    judge = QwenLocalJudge(client=mock_ollama_client)
    await judge.verify(src, label="lamp")
    sent_images = mock_ollama_client.last_call_kwargs["images"]
    assert len(sent_images) == 1
    out_bytes = sent_images[0]
    with Image.open(io.BytesIO(out_bytes)) as out_img:
        out_img.load()
        w, h = out_img.size
    assert (w, h) == (150, 150)


@pytest.mark.parametrize("verdict", ["yes", "no", "unsure"])
async def test_happy_path_returns_each_verdict(
    mock_ollama_client, verdict: str
) -> None:
    """Ollama -> JSON {"verdict": V} round-trips to V."""
    mock_ollama_client.set_response(json.dumps({"verdict": verdict}))
    judge = QwenLocalJudge(client=mock_ollama_client)
    result = await judge.verify(_solid_jpeg((40, 40)), label="lamp")
    assert result == verdict


async def test_dict_response_with_verdict_key_is_accepted(
    mock_ollama_client,
) -> None:
    """A pre-parsed dict (the production OllamaClient.generate shape) works."""
    mock_ollama_client.set_response({"verdict": "yes"})
    judge = QwenLocalJudge(client=mock_ollama_client)
    result = await judge.verify(_solid_jpeg((40, 40)), label="lamp")
    assert result == "yes"


async def test_json_parse_failure_returns_unsure(mock_ollama_client) -> None:
    """Non-JSON response → ``'unsure'``. MUST NOT raise."""
    mock_ollama_client.set_response("the answer is yes, definitely")
    judge = QwenLocalJudge(client=mock_ollama_client)
    result = await judge.verify(_solid_jpeg((40, 40)), label="lamp")
    assert result == "unsure"


async def test_malformed_verdict_returns_unsure(mock_ollama_client) -> None:
    """Valid JSON but unknown verdict value → ``'unsure'``."""
    mock_ollama_client.set_response(json.dumps({"verdict": "maybe"}))
    judge = QwenLocalJudge(client=mock_ollama_client)
    result = await judge.verify(_solid_jpeg((40, 40)), label="lamp")
    assert result == "unsure"


async def test_keep_alive_60s_plumbed_to_ollama_generate(
    mock_ollama_client,
) -> None:
    """``ollama.generate`` is invoked with ``keep_alive='60s'`` by default."""
    judge = QwenLocalJudge(client=mock_ollama_client)
    await judge.verify(_solid_jpeg((40, 40)), label="lamp")
    assert mock_ollama_client.last_call_kwargs["keep_alive"] == "60s"


async def test_format_json_plumbed_to_ollama_generate(
    mock_ollama_client,
) -> None:
    """``ollama.generate`` is invoked with ``format='json'`` for structured output."""
    judge = QwenLocalJudge(client=mock_ollama_client)
    await judge.verify(_solid_jpeg((40, 40)), label="lamp")
    assert mock_ollama_client.last_call_kwargs["format"] == "json"


async def test_ollama_timeout_returns_unsure(mock_ollama_client) -> None:
    """``TimeoutError`` is swallowed and returned as ``'unsure'``."""
    mock_ollama_client.raise_on_call(TimeoutError("ollama timeout"))
    judge = QwenLocalJudge(client=mock_ollama_client)
    result = await judge.verify(_solid_jpeg((40, 40)), label="lamp")
    assert result == "unsure"


async def test_arbitrary_transport_exception_returns_unsure(
    mock_ollama_client,
) -> None:
    """Any unexpected exception is swallowed and returned as ``'unsure'``."""
    mock_ollama_client.raise_on_call(RuntimeError("kaboom"))
    judge = QwenLocalJudge(client=mock_ollama_client)
    result = await judge.verify(_solid_jpeg((40, 40)), label="lamp")
    assert result == "unsure"


async def test_judge_name_is_stable_string(mock_ollama_client) -> None:
    """``QwenLocalJudge.name`` is the stable backend identifier."""
    judge = QwenLocalJudge(client=mock_ollama_client)
    assert judge.name == "qwen2.5vl:3b"
