"""DINOv2 ViT-B/14 embedder shell.

Section-04 ships the contract + a deterministic-fake backend used by tests.
The real MLX loader is wired in section-05 alongside the Apple-Silicon
spike; section-04's tests exercise the interface, not the model weights.

The runtime dimension is asserted at 768. If a fallback loader (e.g., ViT-S/14
returning 384-d) gets swapped in, ``embed`` raises ``DimMismatchError`` —
this is the regression trip-wire for §11.1.
"""
from __future__ import annotations

import hashlib
from typing import Callable, Optional

import numpy as np

EMBED_DIM = 768
EmbedFn = Callable[[np.ndarray], np.ndarray]


class DimMismatchError(RuntimeError):
    """Raised when a DINOv2 backend returns a vector of unexpected dimension.

    Trip-wire for the §11.1 ViT-S/14 fallback swap.
    """


def _deterministic_fake_embed(crop: np.ndarray) -> np.ndarray:
    """Test-only backend: hash the input pixels into a 768-d float16 vector.

    Same input → same vector (replay-test friendly). Different inputs → almost-
    surely different vectors. L2-normalised.
    """
    digest = hashlib.sha256(crop.tobytes()).digest()
    # Tile the hash bytes to fill 768 float16 values.
    seed = int.from_bytes(digest[:8], "big", signed=False) & 0x7FFFFFFF
    rng = np.random.default_rng(seed)
    raw = rng.standard_normal(EMBED_DIM).astype(np.float16)
    norm = np.linalg.norm(raw)
    if norm == 0:
        raw[0] = np.float16(1.0)
        norm = 1.0
    return (raw / norm).astype(np.float16)


class DinoV2Loader:
    """Singleton-style loader. Section-01 wired this for warmup; section-04
    fills in real embedding behaviour.

    The backend is injectable so tests can pin output. Section-05 will swap
    the default backend for the real MLX path.
    """

    name = "dinov2"
    EMBED_DIM = EMBED_DIM

    def __init__(self, *, backend: Optional[EmbedFn] = None) -> None:
        self._backend: EmbedFn = backend or _deterministic_fake_embed
        self.loaded = True

    async def warmup(self) -> None:  # pragma: no cover — sidecar lifecycle only
        # Synthetic 1×1×3 black image — exercises the backend once on boot.
        self.embed(np.zeros((224, 224, 3), dtype=np.uint8))

    def embed(self, image_224: np.ndarray) -> np.ndarray:
        """Embed a 224×224×3 uint8 image and return a 768-d float16
        L2-normalised vector.

        Raises ``DimMismatchError`` if the backend silently returned a
        different dim (catches the §11.1 ViT-S/14 fallback swap).
        """
        if image_224.dtype != np.uint8:
            image_224 = image_224.astype(np.uint8)
        out = self._backend(image_224)
        if out.shape != (EMBED_DIM,):
            raise DimMismatchError(
                f"DINOv2 backend returned {out.shape}; expected ({EMBED_DIM},)"
            )
        if out.dtype != np.float16:
            out = out.astype(np.float16)
        return out
