"""EfficientSAM-Ti loader (§3.7 + §11.1 spike target)."""
from __future__ import annotations

import hashlib
from typing import Callable, Optional, Sequence

import numpy as np

# (image, list of bboxes [(x, y, w, h)]) → list of mask uint8 arrays (0/1)
EffSAMBackend = Callable[
    [np.ndarray, Sequence[tuple[float, float, float, float]]],
    list[np.ndarray],
]


def _deterministic_fake_effsam(
    image: np.ndarray,
    bboxes: Sequence[tuple[float, float, float, float]],
) -> list[np.ndarray]:
    """Test-only backend: a mask matching the bbox (zero offset/expansion).

    The fake produces a binary mask of the same H×W as the image with 1s
    inside the bbox and 0s elsewhere — IoU with the bbox is 1.0 by
    construction. Real EfficientSAM masks are tighter than the bbox, but
    this fake's value is testing the surrounding plumbing (per-box failure,
    op-level error handling, deterministic ordering).
    """
    if image.size == 0:
        return [np.zeros((0, 0), dtype=np.uint8) for _ in bboxes]
    h, w = image.shape[:2]
    masks: list[np.ndarray] = []
    for x, y, bw, bh in bboxes:
        m = np.zeros((h, w), dtype=np.uint8)
        x0, y0 = max(0, int(x)), max(0, int(y))
        x1, y1 = min(w, int(x + bw)), min(h, int(y + bh))
        if x1 > x0 and y1 > y0:
            m[y0:y1, x0:x1] = 1
        masks.append(m)
    return masks


def encode_rle(mask: np.ndarray) -> bytes:
    """COCO-style Run-Length Encoding of a binary mask, returned as bytes.

    Format: little-endian uint32 height, uint32 width, then runs as
    repeated uint32 (run length). Always starts with a 0-run (zero
    pixels) so decoders can alternate 0/1 unambiguously.
    """
    if mask.size == 0:
        return b"\x00" * 8
    flat = mask.flatten().astype(np.uint8)
    h, w = mask.shape[:2]
    runs: list[int] = []
    cur = 0
    count = 0
    for v in flat.tolist():
        if v == cur:
            count += 1
        else:
            runs.append(count)
            cur = v
            count = 1
    runs.append(count)
    header = h.to_bytes(4, "little") + w.to_bytes(4, "little")
    body = b"".join(int(r).to_bytes(4, "little") for r in runs)
    return header + body


def mask_iou_with_bbox(
    mask: np.ndarray, bbox_xywh: tuple[float, float, float, float]
) -> float:
    """IoU between the mask and the bbox area."""
    if mask.size == 0:
        return 0.0
    h, w = mask.shape[:2]
    x, y, bw, bh = bbox_xywh
    x0, y0 = max(0, int(x)), max(0, int(y))
    x1, y1 = min(w, int(x + bw)), min(h, int(y + bh))
    bbox_mask = np.zeros_like(mask, dtype=np.uint8)
    if x1 > x0 and y1 > y0:
        bbox_mask[y0:y1, x0:x1] = 1
    inter = int((mask & bbox_mask).sum())
    union = int((mask | bbox_mask).sum())
    if union == 0:
        return 0.0
    return inter / union


class EffSAMLoader:
    name = "effsam"

    def __init__(self, *, backend: Optional[EffSAMBackend] = None) -> None:
        self._backend: EffSAMBackend = backend or _deterministic_fake_effsam
        self.loaded = True

    async def warmup(self) -> None:  # pragma: no cover
        self._backend(np.zeros((1, 1, 3), dtype=np.uint8), [])

    def segment(
        self,
        image: np.ndarray,
        bboxes: Sequence[tuple[float, float, float, float]],
    ) -> list[np.ndarray]:
        return self._backend(image, bboxes)
