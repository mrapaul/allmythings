"""FAISS in-memory index placeholder.

Section-06 fills this in with the real per-run index used by
``cross_pass_dedup`` and ``cross_frame_dedup``. Section-01 exports the
class shell so imports resolve.
"""
from __future__ import annotations


class FaissIndex:  # pragma: no cover
    """Placeholder; real implementation lands in section-06."""

    def __init__(self, dim: int = 768) -> None:
        self.dim = dim
        self._items: list[tuple[str, bytes]] = []

    def add(self, key: str, vector_bytes: bytes) -> None:
        self._items.append((key, vector_bytes))

    def search(self, vector_bytes: bytes, k: int = 3) -> list[tuple[str, float]]:
        return []
