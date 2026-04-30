"""Prompt-expansion cache (§3.3).

Embedding-hash-keyed cache of ``PromptList`` outputs. Keyed by
``hash(round(median_scene_embedding, 3 dp))``. The bypass-on-
``embedding_failed`` decision lives in the op (vlm_prompt_expansion), NOT
here — this class has no opinion about embedding state, it just stores
by key.

LRU-bounded for v1 (no persistence requirement); ``max_entries=10_000``
default.
"""
from __future__ import annotations

import hashlib
from collections import OrderedDict
from typing import Iterable, Optional

import numpy as np

from pipeline_service.types import PromptList


def median_embedding(vectors: list[np.ndarray]) -> np.ndarray:
    """Pick the vector with minimum sum-of-distances to all others.

    Tie-break: index ascending (i.e. the earliest frame wins).
    Vectors must be float32/float16 NumPy arrays; the result is one of them.
    """
    if not vectors:
        raise ValueError("median_embedding requires at least one vector")
    if len(vectors) == 1:
        return vectors[0]
    arr = np.stack([v.astype(np.float32) for v in vectors])
    dists = np.sum(np.linalg.norm(arr[:, None, :] - arr[None, :, :], axis=-1), axis=1)
    idx = int(np.argmin(dists))
    return vectors[idx]


def cache_key_for(vectors: Iterable[np.ndarray]) -> str:
    """Stable cache key for a list of scene-embedding vectors.

    Computes the median, rounds each component to 3 dp, hashes via SHA-256.
    """
    vec_list = list(vectors)
    if not vec_list:
        return "empty"
    med = median_embedding(vec_list).astype(np.float32)
    rounded = np.round(med, decimals=3)
    return hashlib.sha256(rounded.tobytes()).hexdigest()


class PromptCache:
    """In-process LRU cache of ``PromptList`` outputs."""

    def __init__(self, *, max_entries: int = 10_000) -> None:
        self._max = max_entries
        self._store: "OrderedDict[str, PromptList]" = OrderedDict()

    def get(self, key: str) -> Optional[PromptList]:
        if key not in self._store:
            return None
        self._store.move_to_end(key)
        return self._store[key]

    def set(self, key: str, value: PromptList) -> None:
        if key in self._store:
            self._store.move_to_end(key)
        self._store[key] = value
        while len(self._store) > self._max:
            self._store.popitem(last=False)

    def __len__(self) -> int:
        return len(self._store)

    def clear(self) -> None:
        self._store.clear()


# Module-level singleton — re-used across runs in a single sidecar process.
_GLOBAL_CACHE: Optional[PromptCache] = None


def get_global_cache() -> PromptCache:
    global _GLOBAL_CACHE
    if _GLOBAL_CACHE is None:
        _GLOBAL_CACHE = PromptCache()
    return _GLOBAL_CACHE


def reset_global_cache() -> None:
    """Test helper — drop any cached entries between tests."""
    global _GLOBAL_CACHE
    _GLOBAL_CACHE = None
