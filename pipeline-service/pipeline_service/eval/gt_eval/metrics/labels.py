"""Label F1 + box-aware F1@0.5 metrics.

``label_f1`` measures pure label correctness without IoU. For each
image, build the multiset of predicted-label vs GT-label pairs and
greedily count label matches via the configured ``LabelMatcher``.

``box_aware_f1_50`` requires BOTH IoU >= 0.5 AND a label match. Uses
``match_boxes`` from ``gt_eval.matchers.iou`` for the assignment.

Public surface: ``label_f1``, ``LabelMetrics``.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Sequence

from pipeline_service.eval.gt_eval.matchers.iou import match_boxes

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LabelMetrics:
    """Output of ``label_f1``."""

    label_f1: float
    box_aware_f1_50: float
    label_precision: float
    label_recall: float


def _detection_label(det: Any) -> str:
    return str(getattr(det, "primaryLabel", None) or getattr(det, "label", "") or "")


def _f1(precision: float, recall: float) -> float:
    if precision == 0.0 and recall == 0.0:
        return 0.0
    return 2.0 * precision * recall / (precision + recall)


def _vacuous_metrics() -> LabelMetrics:
    return LabelMetrics(
        label_f1=1.0,
        box_aware_f1_50=1.0,
        label_precision=1.0,
        label_recall=1.0,
    )


def label_f1(
    observations: Sequence[Any],
    ground_truths: Sequence[Sequence[Any]],
    *,
    label_matcher,
    image_sizes: Sequence[tuple[int, int]] | None = None,
    iou_threshold: float = 0.5,
) -> LabelMetrics:
    """Aggregate label / box-aware F1 over the corpus (micro-average)."""
    if image_sizes is None:
        image_sizes = [(4096, 4096) for _ in observations]
    if len(observations) != len(ground_truths) or len(observations) != len(image_sizes):
        raise ValueError("label_f1: length mismatch on inputs")

    n_predictions = sum(len(getattr(o, "detections", [])) for o in observations)
    n_ground_truths = sum(len(g) for g in ground_truths)
    if n_predictions == 0 and n_ground_truths == 0:
        return _vacuous_metrics()
    if n_predictions == 0:
        return LabelMetrics(0.0, 0.0, 0.0, 0.0)
    if n_ground_truths == 0:
        return LabelMetrics(0.0, 0.0, 0.0, 1.0)

    label_tp = 0
    label_fp = 0
    label_fn = 0

    box_tp = 0
    box_fp = 0
    box_fn = 0

    for obs, gts, (w, h) in zip(observations, ground_truths, image_sizes):
        detections = list(getattr(obs, "detections", []))
        n_det = len(detections)
        n_gt = len(gts)

        gt_used = [False] * n_gt
        per_image_label_tp = 0
        for det in detections:
            pred = _detection_label(det).lower().strip()
            matched_idx = -1
            for j, gt in enumerate(gts):
                if gt_used[j]:
                    continue
                gt_label = str(getattr(gt, "category_name", "")).lower().strip()
                if label_matcher(pred, gt_label):
                    matched_idx = j
                    break
            if matched_idx >= 0:
                gt_used[matched_idx] = True
                per_image_label_tp += 1

        label_tp += per_image_label_tp
        label_fp += n_det - per_image_label_tp
        label_fn += n_gt - per_image_label_tp

        matches, unmatched_pred_idxs, unmatched_gt_idxs = match_boxes(
            detections,
            gts,
            iou_threshold=iou_threshold,
            image_width=int(w),
            image_height=int(h),
        )
        per_image_box_tp = 0
        for m in matches:
            pred_label = _detection_label(detections[m.pred_idx]).lower().strip()
            gt_label = str(getattr(gts[m.gt_idx], "category_name", "")).lower().strip()
            if label_matcher(pred_label, gt_label):
                per_image_box_tp += 1
        box_tp += per_image_box_tp
        # FP/FN: total preds minus matched-with-correct-label = FP; same for FN.
        n_matched = len(matches)
        box_fp += (n_det - per_image_box_tp) - 0  # everything not a TP is an FP
        box_fn += n_gt - per_image_box_tp
        # NB: we treat IoU-matched but label-mismatched detections as both
        # FP (wrong label) and FN (GT not matched). Label F1 already counts
        # this asymmetry; box-aware F1 follows the LVIS convention.
        _ = n_matched
        _ = unmatched_pred_idxs
        _ = unmatched_gt_idxs

    label_precision = label_tp / max(label_tp + label_fp, 1)
    label_recall = label_tp / max(label_tp + label_fn, 1)
    label_f1_v = _f1(label_precision, label_recall)

    box_precision = box_tp / max(box_tp + box_fp, 1)
    box_recall = box_tp / max(box_tp + box_fn, 1)
    box_aware_f1_50 = _f1(box_precision, box_recall)

    return LabelMetrics(
        label_f1=label_f1_v,
        box_aware_f1_50=box_aware_f1_50,
        label_precision=label_precision,
        label_recall=label_recall,
    )


__all__ = ["LabelMetrics", "label_f1"]
