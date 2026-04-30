"""HTTP client for local Ollama with per-model single-flight semaphore.

§3.0 of claude-plan.md: ALL Ollama calls in pipeline_service go through this
client. The per-model ``asyncio.Semaphore(1)`` intentionally serialises calls
to the same model — Ollama serialises on a single Mac GPU anyway, and this
prevents memory thrash from concurrent model swaps. Different models share
no semaphore.

Error taxonomy is **load-bearing** for ``classification_refine``'s tier
chain:

  - ``OllamaTimeout``       — per-call timeout; classification_refine moves to next tier
  - ``OllamaParseError``    — malformed JSON in response; **NOT** retried within tier
  - ``OllamaServerError``   — 5xx; classification_refine moves to next tier
  - ``OllamaClientError``   — 4xx (other than 404); deterministic — does not retry

The fenced "```json ... ```" extraction matches the existing Temporal worker's
``extractJson`` (api-service/src/temporal/activities/enrich-item.activity.ts).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Any, Literal, Optional

import httpx

logger = logging.getLogger("pipeline_service.models.ollama_client")


class OllamaError(Exception):
    """Base class for Ollama client failures."""


class OllamaTimeout(OllamaError, TimeoutError):
    """Per-call timeout."""


class OllamaParseError(OllamaError):
    """Malformed JSON in Ollama response. Not retryable."""


class OllamaServerError(OllamaError):
    """5xx from Ollama. Retryable / fall-through."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(f"Ollama returned {status}: {message[:200]}")
        self.status = status


class OllamaClientError(OllamaError):
    """4xx from Ollama. Deterministic — not retryable."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(f"Ollama returned {status}: {message[:200]}")
        self.status = status


_FENCED_JSON = re.compile(r"```(?:json)?\s*([\s\S]*?)```")


def _extract_json(text: str) -> str:
    """Match the existing Temporal worker's extractJson() helper."""
    fenced = _FENCED_JSON.search(text)
    if fenced:
        return fenced.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        return text[start : end + 1]
    return text


class OllamaClient:
    """HTTP client to local Ollama with per-model single-flight semaphore."""

    name = "ollama_client"

    def __init__(
        self,
        host: Optional[str] = None,
        *,
        default_timeout_s: float = 30.0,
    ) -> None:
        self._host = host or os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")
        self._default_timeout_s = default_timeout_s
        self._semaphores: dict[str, asyncio.Semaphore] = {}
        self._sem_lock = asyncio.Lock()

    def get_semaphore(self, model: str) -> asyncio.Semaphore:
        """Synchronous accessor — used by section-01's data-structure test
        and by callers that want to peek at the semaphore.
        """
        sem = self._semaphores.get(model)
        if sem is None:
            sem = asyncio.Semaphore(1)
            self._semaphores[model] = sem
        return sem

    async def _sem_for(self, model: str) -> asyncio.Semaphore:
        async with self._sem_lock:
            sem = self._semaphores.get(model)
            if sem is None:
                sem = asyncio.Semaphore(1)
                self._semaphores[model] = sem
            return sem

    async def warmup(self) -> None:  # pragma: no cover — trivial
        return None

    async def generate(
        self,
        *,
        model: str,
        prompt: str,
        images: Optional[list[bytes]] = None,
        format: Optional[Literal["json"]] = None,
        options: Optional[dict[str, Any]] = None,
        timeout_s: Optional[float] = None,
    ) -> dict[str, Any]:
        """POST /api/generate. Holds the per-model semaphore for the whole call.

        Returns parsed JSON dict from Ollama's ``response`` field. Raises
        ``OllamaParseError`` on malformed JSON, ``OllamaServerError`` on 5xx,
        ``OllamaClientError`` on 4xx, ``OllamaTimeout`` on per-call timeout.
        """
        timeout = timeout_s if timeout_s is not None else self._default_timeout_s
        sem = await self._sem_for(model)
        body: dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": options or {"num_ctx": 4096, "temperature": 0.2},
        }
        if images is not None:
            # Ollama expects base64-encoded images.
            import base64

            body["images"] = [base64.b64encode(img).decode("ascii") for img in images]
        if format is not None:
            body["format"] = format

        async with sem:
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    res = await client.post(f"{self._host}/api/generate", json=body)
            except httpx.TimeoutException as exc:
                raise OllamaTimeout(f"timeout calling {model} after {timeout}s") from exc
            except httpx.ConnectError as exc:
                # Connection failures look like 5xx to the caller — fall through
                # the tier chain (matching enrich-item.activity.ts retryable=true).
                raise OllamaServerError(0, f"connection failed: {exc}") from exc
            if 500 <= res.status_code < 600:
                raise OllamaServerError(res.status_code, res.text)
            if res.status_code >= 400:
                raise OllamaClientError(res.status_code, res.text)

            try:
                payload = res.json()
            except ValueError as exc:
                raise OllamaParseError(
                    f"non-JSON wrapper from Ollama: {res.text[:200]}"
                ) from exc

            raw = payload.get("response", "")
            if not isinstance(raw, str):
                raise OllamaParseError("Ollama response.response was not a string")
            try:
                return json.loads(_extract_json(raw))
            except json.JSONDecodeError as exc:
                raise OllamaParseError(
                    f"Ollama response was not valid JSON: {raw[:200]}"
                ) from exc
