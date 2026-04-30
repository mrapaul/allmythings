"""In-memory cosine-similarity index for cross_frame_dedup.

Section-06 ships a numpy-backed implementation. ``faiss-cpu`` can swap
in behind the same interface; for in-burst (≤ ~30 vectors) sizes the
brute-force numpy path is fast enough and avoids a heavyweight dep.

Per §3.0 + §3.11 of the master plan: the index is **per-run only** —
never persisted to ``DAGSTER_HOME``. Section-07 asserts this contract
by instantiating the op twice and confirming the second sees an empty
index.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np


@dataclass
class _Hit:
    detection_id: str
    cosine: float


class FaissIndex:
    """Brute-force cosine index. Vectors are L2-normalised on add."""

    def __init__(self, dim: int = 768) -> None:
        self.dim = dim
        self._ids: list[str] = []
        self._vectors: Optional[np.ndarray] = None  # shape (N, dim) f32

    def __len__(self) -> int:
        return len(self._ids)

    def extend(self, detection_id: str, vector: np.ndarray) -> None:
        v = vector.astype(np.float32)
        norm = float(np.linalg.norm(v))
        if norm > 0:
            v = v / norm
        v = v.reshape(1, -1)
        if v.shape[1] != self.dim:
            raise ValueError(f"expected vector dim {self.dim}, got {v.shape[1]}")
        if self._vectors is None:
            self._vectors = v
        else:
            self._vectors = np.vstack([self._vectors, v])
        self._ids.append(detection_id)

    def knn(self, vector: np.ndarray, k: int = 3) -> list[_Hit]:
        if self._vectors is None or len(self._ids) == 0:
            return []
        q = vector.astype(np.float32)
        qnorm = float(np.linalg.norm(q))
        if qnorm > 0:
            q = q / qnorm
        sims = (self._vectors @ q.reshape(-1, 1)).ravel()
        top = np.argsort(-sims)[:k]
        return [_Hit(detection_id=self._ids[int(i)], cosine=float(sims[int(i)])) for i in top]
