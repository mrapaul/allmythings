"""IoU computation and Hungarian-assignment box matching.

Coordinate convention: all internal IoU math is xyxy with **max edges
exclusive** (so two touching boxes have IoU 0.0). Predictions arrive as
``BBox`` objects (xywh, top-left origin); ``GtBox`` arrives as xyxy
already (see ``datasets.protocol``). Conversion happens once at the top
of ``match_boxes``.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Sequence

import numpy as np

logger = logging.getLogger(__name__)

try:
    from scipy.optimize import linear_sum_assignment as _hungarian

    _HUNGARIAN_AVAILABLE = True
except ImportError:  # pragma: no cover -- defensive
    _HUNGARIAN_AVAILABLE = False
    _hungarian = None  # type: ignore[assignment]
    logger.warning(
        "scipy.optimize.linear_sum_assignment unavailable; "
        "match_boxes will use greedy fallback."
    )


@dataclass(frozen=True)
class Match:
    """A single (pred, gt) pairing with its IoU."""

    pred_idx: int
    gt_idx: int
    iou: float


def _xywh_to_xyxy_clamped(
    x: float,
    y: float,
    w: float,
    h: float,
    image_width: int,
    image_height: int,
) -> tuple[float, float, float, float]:
    """Convert xywh to xyxy with exclusive max edges, clamped to the image bounds.

    A box fully outside the image collapses to zero area (x1==x2 or
    y1==y2); the caller's job to filter those.
    """
    x1 = max(0.0, float(x))
    y1 = max(0.0, float(y))
    x2 = min(float(image_width), float(x) + float(w))
    y2 = min(float(image_height), float(y) + float(h))
    if x2 < x1:
        x2 = x1
    if y2 < y1:
        y2 = y1
    return x1, y1, x2, y2


def _iou_xyxy(
    a: tuple[float, float, float, float],
    b: tuple[float, float, float, float],
) -> float:
    """IoU of two xyxy boxes. Max edges exclusive."""
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)
    inter_w = inter_x2 - inter_x1
    inter_h = inter_y2 - inter_y1
    if inter_w <= 0.0 or inter_h <= 0.0:
        return 0.0
    inter = inter_w * inter_h
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    if union <= 0.0:
        return 0.0
    return float(inter) / float(union)


def _extract_xywh(pred: object) -> tuple[float, float, float, float]:
    """Read xywh out of a prediction object.

    Accepts:
      - objects with a ``bbox`` attribute exposing ``x/y/width/height``
        (production ``PipelineDetection``);
      - objects with ``x/y/width/height`` directly (production ``BBox``);
      - 4-tuples / 4-lists in xywh order (test ergonomics).
    """
    if hasattr(pred, "bbox"):
        b = pred.bbox
        return float(b.x), float(b.y), float(b.width), float(b.height)
    if all(hasattr(pred, attr) for attr in ("x", "y", "width", "height")):
        return float(pred.x), float(pred.y), float(pred.width), float(pred.height)  # type: ignore[attr-defined]
    if isinstance(pred, (tuple, list)) and len(pred) == 4:
        x, y, w, h = pred
        return float(x), float(y), float(w), float(h)
    raise TypeError(
        f"match_boxes: cannot extract xywh from {type(pred).__name__}; "
        "expected obj.bbox, obj.x/y/width/height, or a 4-tuple."
    )


def _extract_xyxy_from_gt(gt: object) -> tuple[float, float, float, float]:
    """Read xyxy out of a GT box (``GtBox`` NamedTuple or 4-tuple)."""
    if hasattr(gt, "x1") and hasattr(gt, "y1") and hasattr(gt, "x2") and hasattr(gt, "y2"):
        return float(gt.x1), float(gt.y1), float(gt.x2), float(gt.y2)  # type: ignore[attr-defined]
    if isinstance(gt, (tuple, list)) and len(gt) >= 4:
        return float(gt[0]), float(gt[1]), float(gt[2]), float(gt[3])
    raise TypeError(
        f"match_boxes: cannot extract xyxy from {type(gt).__name__}; "
        "expected GtBox or a 4-tuple."
    )


def _greedy_assignment(
    iou_matrix: np.ndarray, iou_threshold: float
) -> list[tuple[int, int]]:
    """Documented suboptimal fallback. Sort cells by descending IoU,
    take first-fit pairs above ``iou_threshold``.
    """
    n_rows, n_cols = iou_matrix.shape
    cells = []
    for i in range(n_rows):
        for j in range(n_cols):
            iou_val = float(iou_matrix[i, j])
            if iou_val >= iou_threshold:
                cells.append((iou_val, i, j))
    cells.sort(reverse=True)
    used_rows: set[int] = set()
    used_cols: set[int] = set()
    out: list[tuple[int, int]] = []
    for _iou_val, i, j in cells:
        if i in used_rows or j in used_cols:
            continue
        used_rows.add(i)
        used_cols.add(j)
        out.append((i, j))
    return out


def match_boxes(
    predictions: Sequence,
    gts: Sequence,
    *,
    iou_threshold: float = 0.5,
    image_width: int,
    image_height: int,
) -> tuple[list[Match], list[int], list[int]]:
    """Match predictions to GT boxes by IoU using Hungarian assignment.

    Returns ``(matches, unmatched_pred_idxs, unmatched_gt_idxs)`` where
    ``pred_idxs`` are indices into the *original* ``predictions``
    sequence. Predictions that collapse to zero area after image-bound
    clamping are dropped entirely — their indices appear in neither
    list.
    """
    pred_xyxy: list[tuple[float, float, float, float]] = []
    surviving_pred_idxs: list[int] = []
    for original_idx, pred in enumerate(predictions):
        x, y, w, h = _extract_xywh(pred)
        clamped = _xywh_to_xyxy_clamped(x, y, w, h, image_width, image_height)
        x1, y1, x2, y2 = clamped
        if (x2 - x1) <= 0.0 or (y2 - y1) <= 0.0:
            continue
        pred_xyxy.append(clamped)
        surviving_pred_idxs.append(original_idx)

    gt_xyxy = [_extract_xyxy_from_gt(gt) for gt in gts]

    n_pred = len(pred_xyxy)
    n_gt = len(gt_xyxy)
    if n_pred == 0 and n_gt == 0:
        return [], [], []
    if n_pred == 0:
        return [], [], list(range(n_gt))
    if n_gt == 0:
        return [], list(surviving_pred_idxs), []

    iou_matrix = np.zeros((n_pred, n_gt), dtype=np.float64)
    for i, pa in enumerate(pred_xyxy):
        for j, pb in enumerate(gt_xyxy):
            iou_matrix[i, j] = _iou_xyxy(pa, pb)

    if _HUNGARIAN_AVAILABLE and _hungarian is not None:
        # linear_sum_assignment minimises cost — negate IoU.
        row_idx, col_idx = _hungarian(-iou_matrix)
        candidate_pairs = list(zip(row_idx.tolist(), col_idx.tolist()))
    else:  # pragma: no cover -- defensive
        candidate_pairs = _greedy_assignment(iou_matrix, iou_threshold)

    matches: list[Match] = []
    matched_pred_local: set[int] = set()
    matched_gt: set[int] = set()
    for i, j in candidate_pairs:
        iou_val = float(iou_matrix[i, j])
        if iou_val < iou_threshold:
            continue
        matches.append(
            Match(pred_idx=surviving_pred_idxs[i], gt_idx=int(j), iou=iou_val)
        )
        matched_pred_local.add(i)
        matched_gt.add(int(j))

    unmatched_pred_idxs = [
        surviving_pred_idxs[i]
        for i in range(n_pred)
        if i not in matched_pred_local
    ]
    unmatched_gt_idxs = [j for j in range(n_gt) if j not in matched_gt]
    return matches, unmatched_pred_idxs, unmatched_gt_idxs
