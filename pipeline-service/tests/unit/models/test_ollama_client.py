"""§3.0 + §3.12 OllamaClient — per-model semaphore + error taxonomy."""
from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from pipeline_service.models.ollama_client import (
    OllamaClient,
    OllamaParseError,
    OllamaServerError,
    OllamaTimeout,
)


@pytest.fixture
def httpx_mock_strict(httpx_mock):
    httpx_mock.non_mocked_hosts = []
    return httpx_mock


@pytest.mark.asyncio
async def test_generate_happy_path_returns_parsed_dict(httpx_mock_strict) -> None:
    httpx_mock_strict.add_response(
        method="POST",
        url="http://127.0.0.1:11434/api/generate",
        json={"response": '{"name": "Brass desk lamp", "category": "lighting"}'},
    )
    client = OllamaClient()
    out = await client.generate(model="qwen2.5vl:7b", prompt="x", images=[b"\x00"], format="json")
    assert out == {"name": "Brass desk lamp", "category": "lighting"}


@pytest.mark.asyncio
async def test_generate_passes_keep_alive_to_ollama(httpx_mock_strict) -> None:
    """``keep_alive`` lets callers control how long Ollama holds the model
    in memory after the response. ``0`` unloads immediately — used by
    ``vlm_prompt_expansion`` to free MPS for the next pipeline stage.
    The parameter must reach Ollama's request body verbatim."""
    httpx_mock_strict.add_response(
        method="POST",
        url="http://127.0.0.1:11434/api/generate",
        json={"response": '{"x": 1}'},
    )
    client = OllamaClient()
    await client.generate(
        model="qwen2.5vl:3b", prompt="x", images=[b"\x00"], format="json", keep_alive=0
    )
    requests = httpx_mock_strict.get_requests()
    assert len(requests) == 1
    body = json.loads(requests[0].content.decode())
    assert body["keep_alive"] == 0


@pytest.mark.asyncio
async def test_generate_omits_keep_alive_when_unset(httpx_mock_strict) -> None:
    """No ``keep_alive`` arg → no key in the request body, so Ollama uses
    its default 5-minute hold."""
    httpx_mock_strict.add_response(
        method="POST",
        url="http://127.0.0.1:11434/api/generate",
        json={"response": '{"x": 1}'},
    )
    client = OllamaClient()
    await client.generate(
        model="qwen2.5vl:3b", prompt="x", images=[b"\x00"], format="json"
    )
    body = json.loads(httpx_mock_strict.get_requests()[0].content.decode())
    assert "keep_alive" not in body


@pytest.mark.asyncio
async def test_generate_accepts_string_keep_alive(httpx_mock_strict) -> None:
    """Ollama's keep_alive accepts duration strings like ``"60s"`` or
    ``"10m"``; classification_refine uses ``"60s"`` to span the burst."""
    httpx_mock_strict.add_response(
        method="POST",
        url="http://127.0.0.1:11434/api/generate",
        json={"response": '{"x": 1}'},
    )
    client = OllamaClient()
    await client.generate(
        model="qwen2.5vl:3b", prompt="x", images=[b""], format="json", keep_alive="60s"
    )
    body = json.loads(httpx_mock_strict.get_requests()[0].content.decode())
    assert body["keep_alive"] == "60s"


@pytest.mark.asyncio
async def test_per_model_semaphore_serialises_same_model(httpx_mock_strict) -> None:
    """Spawn N concurrent generate() calls for the same model and assert at
    most one is in flight at a time.
    """
    in_flight: list[int] = [0]
    peak = [0]

    async def slow_responder(_request: httpx.Request) -> httpx.Response:
        in_flight[0] += 1
        peak[0] = max(peak[0], in_flight[0])
        await asyncio.sleep(0.05)
        in_flight[0] -= 1
        return httpx.Response(200, json={"response": '{"ok": 1}'})

    httpx_mock_strict.add_callback(
        slow_responder, url="http://127.0.0.1:11434/api/generate", is_reusable=True
    )

    client = OllamaClient()
    tasks = [
        client.generate(model="qwen2.5vl:7b", prompt=f"p{i}", images=[b""], format="json")
        for i in range(5)
    ]
    await asyncio.gather(*tasks)
    assert peak[0] == 1, f"expected 1-in-flight per model, peaked at {peak[0]}"


@pytest.mark.asyncio
async def test_different_models_have_independent_semaphores() -> None:
    """Two different models must NOT share a semaphore — verified at the
    data-structure level (mocking httpx is brittle for true-parallel
    assertions because pytest_httpx serialises callback dispatch).
    """
    client = OllamaClient()
    sem_qwen = client.get_semaphore("qwen2.5vl:7b")
    sem_moon = client.get_semaphore("moondream")
    assert sem_qwen is not sem_moon
    # Hold qwen's semaphore; moondream's must still acquire freely.
    await sem_qwen.acquire()
    try:
        # Should NOT block — proves no shared semaphore.
        acquired = await asyncio.wait_for(sem_moon.acquire(), timeout=0.1)
        assert acquired is None or acquired is True
        sem_moon.release()
    finally:
        sem_qwen.release()


@pytest.mark.asyncio
async def test_5xx_raises_ollama_server_error(httpx_mock_strict) -> None:
    httpx_mock_strict.add_response(
        method="POST", url="http://127.0.0.1:11434/api/generate", status_code=503
    )
    client = OllamaClient()
    with pytest.raises(OllamaServerError):
        await client.generate(model="m", prompt="p", images=[b""], format="json")


@pytest.mark.asyncio
async def test_4xx_raises_distinct_non_retryable(httpx_mock_strict) -> None:
    httpx_mock_strict.add_response(
        method="POST", url="http://127.0.0.1:11434/api/generate", status_code=400
    )
    client = OllamaClient()
    with pytest.raises(Exception) as exc:
        await client.generate(model="m", prompt="p", images=[b""], format="json")
    # 4xx should NOT be OllamaServerError (which is retryable).
    assert not isinstance(exc.value, OllamaServerError)


@pytest.mark.asyncio
async def test_invalid_json_raises_parse_error(httpx_mock_strict) -> None:
    httpx_mock_strict.add_response(
        method="POST",
        url="http://127.0.0.1:11434/api/generate",
        json={"response": "this is not JSON at all"},
    )
    client = OllamaClient()
    with pytest.raises(OllamaParseError):
        await client.generate(model="m", prompt="p", images=[b""], format="json")


@pytest.mark.asyncio
async def test_timeout_raises_ollama_timeout(httpx_mock_strict) -> None:
    """The client must convert httpx.TimeoutException into OllamaTimeout."""
    httpx_mock_strict.add_exception(
        httpx.ReadTimeout("simulated"),
        url="http://127.0.0.1:11434/api/generate",
    )
    client = OllamaClient()
    with pytest.raises(OllamaTimeout):
        await client.generate(
            model="m", prompt="p", images=[b""], format="json", timeout_s=0.05
        )


@pytest.mark.asyncio
async def test_semaphore_released_on_exception(httpx_mock_strict) -> None:
    """A failing call must release its semaphore — otherwise subsequent calls
    deadlock.
    """
    httpx_mock_strict.add_response(
        method="POST",
        url="http://127.0.0.1:11434/api/generate",
        status_code=503,
        is_reusable=True,
    )
    client = OllamaClient()
    for _ in range(3):
        with pytest.raises(OllamaServerError):
            await client.generate(model="qwen2.5vl:7b", prompt="x", images=[b""], format="json")
    # If the semaphore leaked, the next call would hang. Cap with wait_for.
    httpx_mock_strict.reset()
    httpx_mock_strict.add_response(
        method="POST",
        url="http://127.0.0.1:11434/api/generate",
        json={"response": '{"ok": 1}'},
    )
    out = await asyncio.wait_for(
        client.generate(model="qwen2.5vl:7b", prompt="x", images=[b""], format="json"),
        timeout=1.0,
    )
    assert out == {"ok": 1}


@pytest.mark.asyncio
async def test_extracts_json_from_fenced_code_block(httpx_mock_strict) -> None:
    """The Ollama prompts return the JSON inside ```json ...``` fences. The
    client must strip them like the existing Temporal worker does.
    """
    raw = "```json\n" + '{"name": "Lamp"}' + "\n```"
    httpx_mock_strict.add_response(
        method="POST",
        url="http://127.0.0.1:11434/api/generate",
        json={"response": raw},
    )
    client = OllamaClient()
    out = await client.generate(model="m", prompt="p", images=[b""], format="json")
    assert out == {"name": "Lamp"}
