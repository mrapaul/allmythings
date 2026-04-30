"""Ollama HTTP client shell — holds the per-model ``asyncio.Semaphore(1)``
data structure required by §3.0.

Section-01: data structure exists, no callers wire it yet.
Section-03: wires the real HTTP calls and serialises them through the
semaphore (Ollama serialises on a single Mac GPU; concurrent calls cause
memory thrash from model swaps).
"""
from __future__ import annotations

import asyncio
from typing import Optional


class OllamaClient:
    name = "ollama_client"

    def __init__(self, base_url: str = "http://127.0.0.1:11434") -> None:
        self.base_url = base_url
        self._semaphores: dict[str, asyncio.Semaphore] = {}

    def get_semaphore(self, model: str) -> asyncio.Semaphore:
        """Return the per-model semaphore (creating it if it doesn't exist).

        ``Semaphore(1)`` is the contract — exactly one in-flight request per
        model. Used by section-03's classification_refine.
        """
        sem = self._semaphores.get(model)
        if sem is None:
            sem = asyncio.Semaphore(1)
            self._semaphores[model] = sem
        return sem

    async def warmup(self, model: Optional[str] = None) -> None:  # pragma: no cover
        return None
