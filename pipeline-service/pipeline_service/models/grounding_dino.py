"""Grounding DINO 1.5 Edge loader (§3.5 + §11.1 spike target).

Section-05 ships the contract + an injectable deterministic backend used
by tests. The real ONNX-Runtime CoreML EP (or MLX) loader is loaded
behind the same interface; if the spike fails, the fallback (OWLv2-Base
ONNX or YOLO-World-S int8) is loaded under the same interface — the op
contracts in :mod:`pipeline_service.types` do not change.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Callable, Optional, Sequence

import numpy as np


@dataclass
class GroundingDetection:
    """Raw detection from a Grounding DINO call.

    Coordinates are in full-frame pixel space.
    """

    bbox_xywh: tuple[float, float, float, float]
    label: str
    score: float


GroundingBackend = Callable[[np.ndarray, Sequence[str]], list[GroundingDetection]]


def _deterministic_fake_gdino(
    image: np.ndarray, prompts: Sequence[str]
) -> list[GroundingDetection]:
    """Test-only backend: hash(image bytes, prompt) → 0..N detections.

    Same input → same output (replay-friendly). Different prompts → different
    boxes. Empty prompt list → empty output.
    """
    if not prompts:
        return []
    out: list[GroundingDetection] = []
    h, w = image.shape[:2]
    for prompt in prompts:
        digest = hashlib.sha256(image.tobytes() + prompt.encode("utf-8")).digest()
        n = digest[0] % 3  # 0..2 detections per prompt
        for k in range(n):
            seed = int.from_bytes(digest[k * 4 : k * 4 + 4], "big") + 1
            rng = np.random.default_rng(seed)
            x = float(rng.integers(0, max(1, w - 80)))
            y = float(rng.integers(0, max(1, h - 80)))
            bw = float(rng.integers(40, 80))
            bh = float(rng.integers(40, 80))
            score = 0.30 + (digest[k * 4 + 3] / 255.0) * 0.6  # 0.30..0.90
            out.append(
                GroundingDetection(
                    bbox_xywh=(x, y, bw, bh),
                    label=prompt,
                    score=score,
                )
            )
    return out


class GroundingDinoLoader:
    """Loader interface for the Grounding DINO 1.5 Edge model.

    Backend is injectable so tests + section-05's spike can swap real
    model code in without touching the op surface. Section-01 wired
    ``warmup`` into the FastAPI lifespan.
    """

    name = "grounding_dino"

    def __init__(self, *, backend: Optional[GroundingBackend] = None) -> None:
        self._backend: GroundingBackend = backend or _deterministic_fake_gdino
        self.loaded = True

    async def warmup(self) -> None:  # pragma: no cover — sidecar lifecycle
        # 1×1×3 black, no prompts.
        self._backend(np.zeros((1, 1, 3), dtype=np.uint8), [])

    def detect(
        self,
        image: np.ndarray,
        prompts: Sequence[str],
    ) -> list[GroundingDetection]:
        return self._backend(image, prompts)
