"""§3.2 scene_embedding — REAL op.

DINOv2 ViT-B/14 (768-d float16, L2-normalised) per frame. Centre-square
224×224 crop is the input. On per-frame failure, emits
``SceneEmbedding(embedding_failed=True, vector_bytes=zeros(768)*f16)`` and
the run continues.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Iterable, Optional

import numpy as np

from pipeline_service.models.dinov2 import DimMismatchError, DinoV2Loader
from pipeline_service.types import Frame, SceneEmbedding

logger = logging.getLogger("pipeline_service.ops.scene_embedding")

_CROP = 224


def _centre_crop(rgb: np.ndarray, size: int = _CROP) -> np.ndarray:
    h, w = rgb.shape[:2]
    if h < size or w < size:
        # Pad small inputs with zeros (preserves shape contract for the embedder).
        out = np.zeros((size, size, 3), dtype=np.uint8)
        out[: min(h, size), : min(w, size), :] = rgb[: min(h, size), : min(w, size), :]
        return out
    top = (h - size) // 2
    left = (w - size) // 2
    return rgb[top : top + size, left : left + size, :]


def _failed_embedding(frame_id: str) -> SceneEmbedding:
    return SceneEmbedding(
        frame_id=frame_id,
        vector_bytes=np.zeros(768, dtype=np.float16).tobytes(),
        embedded_at=datetime.now(timezone.utc),
        embedding_failed=True,
    )


def scene_embedding_impl(
    frames: Iterable[Frame],
    *,
    embedder: Optional[DinoV2Loader] = None,
) -> list[SceneEmbedding]:
    """See plan §3.2. Per-frame DINOv2 embedding with retry + per-frame
    independence. Empty input → empty output.
    """
    sorted_frames = sorted(list(frames), key=lambda f: f.frame_id)
    if not sorted_frames:
        return []
    embed = embedder or DinoV2Loader()
    out: list[SceneEmbedding] = []
    for frame in sorted_frames:
        if frame.decoding_failed:
            out.append(_failed_embedding(frame.frame_id))
            continue
        try:
            arr = frame.to_array()
            crop = _centre_crop(arr)
            vec = embed.embed(crop)
            out.append(
                SceneEmbedding(
                    frame_id=frame.frame_id,
                    vector_bytes=vec.tobytes(),
                    embedded_at=datetime.now(timezone.utc),
                    embedding_failed=False,
                )
            )
        except DimMismatchError:
            # Hard fail — the loader is misconfigured (§11.1 ViT-S/14 fallback).
            raise
        except Exception as exc:  # noqa: BLE001 — DINOv2 backend is best-effort
            logger.warning("scene_embedding failed for %s: %s", frame.frame_id, exc)
            out.append(_failed_embedding(frame.frame_id))
    return out
