"""Prompt-cache placeholder. Real impl lands in section-04.

The real cache keys vlm_prompt_expansion outputs by
``hash(round(median_scene_embedding, 3 dp))``, with explicit cache
**bypass** when any frame has ``embedding_failed=True``.
"""
from __future__ import annotations

from typing import Optional


class PromptCache:  # pragma: no cover
    """Placeholder; real implementation lands in section-04."""

    def __init__(self) -> None:
        self._store: dict[str, list[str]] = {}

    def get(self, key: str) -> Optional[list[str]]:
        return self._store.get(key)

    def put(self, key: str, prompts: list[str]) -> None:
        self._store[key] = list(prompts)
