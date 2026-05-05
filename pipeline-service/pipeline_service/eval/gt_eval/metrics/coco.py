"""COCO mAP wrapper with dual-pass (class-aware + class-agnostic) evaluation.

Two-pass rationale: the pipeline emits open-vocabulary labels which only
fuzzily match LVIS GT. The class-aware pass measures label-correct box
quality; the class-agnostic pass measures pure box quality independent
of label correctness. Both use the COCO 0.5:0.05:0.95 IoU sweep.

Backend selection: ``pycocotools`` when available (preferred); falls
back to ``torchmetrics.detection.MeanAveragePrecision`` on import error.
The latter does not produce per-category AP, so per-category is empty
in the fallback path.

Confidence sorting reads ``PipelineDetection.confidence``; falls back
to ``PipelineDetection.agreementScore`` when ``confidence == 0``.

Public surface: ``coco_evaluate``, ``CocoEvalResult``, ``PassResult``.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Any, Optional, Sequence

logger = logging.getLogger(__name__)


_PYCOCO_AVAILABLE = False
_TORCHMETRICS_AVAILABLE = False
_BACKEND_NAME = "none"
try:
    from pycocotools.coco import COCO  # noqa: F401
    from pycocotools.cocoeval import COCOeval  # noqa: F401

    _PYCOCO_AVAILABLE = True
    _BACKEND_NAME = "pycocotools"
except ImportError:  # pragma: no cover -- defensive
    try:
        from torchmetrics.detection.mean_ap import MeanAveragePrecision  # noqa: F401

        _TORCHMETRICS_AVAILABLE = True
        _BACKEND_NAME = "torchmetrics"
    except ImportError as exc:
        raise ImportError(
            "Neither pycocotools nor torchmetrics is available; install one. "
            f"Last torchmetrics import error: {exc}"
        ) from exc

logger.info("coco metric backend selected: %s", _BACKEND_NAME)


@dataclass(frozen=True)
class PassResult:
    """One pass of COCO evaluation."""

    map_50_95: float
    map_50: float
    map_75: float
    per_category: dict[str, float] = field(default_factory=dict)


@dataclass(frozen=True)
class CocoEvalResult:
    """Combined dual-pass result."""

    class_aware: PassResult
    class_agnostic: PassResult
    n_predictions: int
    n_ground_truths: int


def _detection_score(det: Any) -> float:
    confidence = float(getattr(det, "confidence", 0.0) or 0.0)
    if confidence > 0.0:
        return confidence
    return float(getattr(det, "agreementScore", 0.0) or 0.0)


def _detection_label(det: Any) -> str:
    return str(getattr(det, "primaryLabel", None) or getattr(det, "label", "") or "")


def _detection_xywh(det: Any) -> tuple[float, float, float, float]:
    if hasattr(det, "bbox"):
        b = det.bbox
        return float(b.x), float(b.y), float(b.width), float(b.height)
    if all(hasattr(det, a) for a in ("x", "y", "width", "height")):
        return float(det.x), float(det.y), float(det.width), float(det.height)
    if isinstance(det, (tuple, list)) and len(det) == 4:
        return float(det[0]), float(det[1]), float(det[2]), float(det[3])
    raise TypeError(f"unrecognised detection shape: {type(det).__name__}")


def _build_label_to_id(ground_truths: Sequence[Sequence[Any]]) -> dict[str, int]:
    seen: list[str] = []
    seen_set: set[str] = set()
    for gts in ground_truths:
        for gt in gts:
            name = getattr(gt, "category_name", None)
            if name is None:
                continue
            if name not in seen_set:
                seen_set.add(name)
                seen.append(name)
    return {name: idx + 1 for idx, name in enumerate(seen)}


def _normalise_label(text: str) -> str:
    return text.strip().lower().replace("_", " ")


def _safe_float(x: Any) -> float:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return 0.0
    if math.isnan(v) or math.isinf(v):
        return 0.0
    return v


def _empty_pass() -> PassResult:
    return PassResult(map_50_95=0.0, map_50=0.0, map_75=0.0, per_category={})


def coco_evaluate(
    observations: Sequence[Any],
    ground_truths: Sequence[Sequence[Any]],
    *,
    label_matcher,
    image_sizes: Optional[Sequence[tuple[int, int]]] = None,
) -> CocoEvalResult:
    """Run both COCO mAP passes against ``observations`` + ``ground_truths``."""
    if image_sizes is None:
        image_sizes = [(4096, 4096) for _ in observations]
    if len(observations) != len(ground_truths) or len(observations) != len(image_sizes):
        raise ValueError(
            "coco_evaluate: length mismatch between observations / ground_truths / image_sizes"
        )

    n_predictions = sum(len(getattr(o, "detections", [])) for o in observations)
    n_ground_truths = sum(len(g) for g in ground_truths)

    if n_predictions == 0 or n_ground_truths == 0:
        return CocoEvalResult(
            class_aware=_empty_pass(),
            class_agnostic=_empty_pass(),
            n_predictions=n_predictions,
            n_ground_truths=n_ground_truths,
        )

    label_to_id = _build_label_to_id(ground_truths)

    class_aware_preds_per_image: list[
        list[tuple[tuple[float, float, float, float], float, int]]
    ] = []
    for obs, gts in zip(observations, ground_truths):
        per_image: list[tuple[tuple[float, float, float, float], float, int]] = []
        gt_by_norm: dict[str, str] = {
            _normalise_label(getattr(g, "category_name", "")): getattr(g, "category_name", "")
            for g in gts
        }
        for det in getattr(obs, "detections", []):
            xywh = _detection_xywh(det)
            score = _detection_score(det)
            pred_label = _normalise_label(_detection_label(det))
            matched_name: Optional[str] = None
            if pred_label and pred_label in gt_by_norm:
                matched_name = gt_by_norm[pred_label]
            else:
                for norm_gt, raw_gt in gt_by_norm.items():
                    if label_matcher(pred_label, norm_gt):
                        matched_name = raw_gt
                        break
            if matched_name is not None:
                per_image.append((xywh, score, label_to_id[matched_name]))
        class_aware_preds_per_image.append(per_image)

    class_aware = _evaluate_pass(
        ground_truths=ground_truths,
        image_sizes=image_sizes,
        preds_per_image=class_aware_preds_per_image,
        label_to_id=label_to_id,
        class_agnostic=False,
    )

    class_agnostic_preds_per_image: list[
        list[tuple[tuple[float, float, float, float], float, int]]
    ] = []
    for obs in observations:
        per_image = []
        for det in getattr(obs, "detections", []):
            per_image.append((_detection_xywh(det), _detection_score(det), 1))
        class_agnostic_preds_per_image.append(per_image)

    class_agnostic = _evaluate_pass(
        ground_truths=ground_truths,
        image_sizes=image_sizes,
        preds_per_image=class_agnostic_preds_per_image,
        label_to_id={"all": 1},
        class_agnostic=True,
    )

    return CocoEvalResult(
        class_aware=class_aware,
        class_agnostic=class_agnostic,
        n_predictions=n_predictions,
        n_ground_truths=n_ground_truths,
    )


def _evaluate_pass(
    ground_truths,
    image_sizes,
    preds_per_image,
    label_to_id,
    *,
    class_agnostic: bool,
) -> PassResult:
    if sum(len(p) for p in preds_per_image) == 0:
        return _empty_pass()
    if _PYCOCO_AVAILABLE:
        return _run_pycoco(
            ground_truths=ground_truths,
            image_sizes=image_sizes,
            preds_per_image=preds_per_image,
            label_to_id=label_to_id,
            class_agnostic=class_agnostic,
        )
    return _run_torchmetrics(
        ground_truths=ground_truths,
        preds_per_image=preds_per_image,
        class_agnostic=class_agnostic,
    )


def _run_pycoco(
    ground_truths,
    image_sizes,
    preds_per_image,
    label_to_id,
    *,
    class_agnostic: bool,
) -> PassResult:
    from pycocotools.coco import COCO
    from pycocotools.cocoeval import COCOeval

    images: list[dict[str, Any]] = []
    annotations: list[dict[str, Any]] = []
    categories: list[dict[str, Any]] = [
        {"id": cid, "name": name, "supercategory": "n/a"}
        for name, cid in label_to_id.items()
    ]

    ann_id = 1
    for image_idx, (gts, (w, h)) in enumerate(zip(ground_truths, image_sizes)):
        images.append({"id": image_idx + 1, "width": int(w), "height": int(h)})
        for gt in gts:
            x1, y1, x2, y2 = float(gt.x1), float(gt.y1), float(gt.x2), float(gt.y2)
            bw = max(0.0, x2 - x1)
            bh = max(0.0, y2 - y1)
            if class_agnostic:
                cat_id = 1
            else:
                name = getattr(gt, "category_name", None)
                cat_id = label_to_id.get(name, 0)
                if cat_id == 0:
                    continue
            annotations.append(
                {
                    "id": ann_id,
                    "image_id": image_idx + 1,
                    "category_id": cat_id,
                    "bbox": [x1, y1, bw, bh],
                    "area": float(bw * bh),
                    "iscrowd": 0,
                }
            )
            ann_id += 1

    coco_gt = COCO()
    coco_gt.dataset = {
        "images": images,
        "annotations": annotations,
        "categories": categories,
    }
    coco_gt.createIndex()

    detections: list[dict[str, Any]] = []
    for image_idx, dets in enumerate(preds_per_image):
        for (x, y, dw, dh), score, cat_id in dets:
            detections.append(
                {
                    "image_id": image_idx + 1,
                    "category_id": int(cat_id),
                    "bbox": [float(x), float(y), float(dw), float(dh)],
                    "score": float(score),
                }
            )
    if not detections or not annotations:
        return _empty_pass()

    coco_dt = coco_gt.loadRes(detections)
    cocoengine = COCOeval(coco_gt, coco_dt, iouType="bbox")
    cocoengine.evaluate()
    cocoengine.accumulate()
    cocoengine.summarize()

    stats = cocoengine.stats
    map_50_95 = _safe_float(stats[0])
    map_50 = _safe_float(stats[1])
    map_75 = _safe_float(stats[2])

    per_category: dict[str, float] = {}
    if not class_agnostic:
        precision = cocoengine.eval.get("precision")
        if precision is not None:
            id_to_name = {cid: name for name, cid in label_to_id.items()}
            cat_ids = cocoengine.params.catIds
            for col_idx, cat_id in enumerate(cat_ids):
                cat_precision = precision[:, :, col_idx, 0, -1]
                valid = cat_precision[cat_precision > -1]
                ap = float(valid.mean()) if valid.size > 0 else 0.0
                ap = _safe_float(ap)
                name = id_to_name.get(int(cat_id))
                if name is not None:
                    per_category[name] = ap
    return PassResult(
        map_50_95=map_50_95,
        map_50=map_50,
        map_75=map_75,
        per_category=per_category,
    )


def _run_torchmetrics(
    ground_truths,
    preds_per_image,
    *,
    class_agnostic: bool,
) -> PassResult:  # pragma: no cover -- exercised only when pycocotools missing
    import torch
    from torchmetrics.detection.mean_ap import MeanAveragePrecision

    metric = MeanAveragePrecision(iou_type="bbox", box_format="xyxy")
    preds: list[dict[str, Any]] = []
    targets: list[dict[str, Any]] = []
    for image_idx, (dets, gts) in enumerate(zip(preds_per_image, ground_truths)):
        if dets:
            preds.append(
                {
                    "boxes": torch.tensor(
                        [[x, y, x + dw, y + dh] for (x, y, dw, dh), _, _ in dets],
                        dtype=torch.float32,
                    ),
                    "scores": torch.tensor([s for _, s, _ in dets], dtype=torch.float32),
                    "labels": torch.tensor([c for _, _, c in dets], dtype=torch.int64),
                }
            )
        else:
            preds.append(
                {
                    "boxes": torch.zeros((0, 4), dtype=torch.float32),
                    "scores": torch.zeros((0,), dtype=torch.float32),
                    "labels": torch.zeros((0,), dtype=torch.int64),
                }
            )
        if gts:
            targets.append(
                {
                    "boxes": torch.tensor(
                        [[g.x1, g.y1, g.x2, g.y2] for g in gts], dtype=torch.float32
                    ),
                    "labels": torch.tensor(
                        [1 for _ in gts], dtype=torch.int64
                    ),
                }
            )
        else:
            targets.append(
                {
                    "boxes": torch.zeros((0, 4), dtype=torch.float32),
                    "labels": torch.zeros((0,), dtype=torch.int64),
                }
            )
    metric.update(preds, targets)
    out = metric.compute()
    return PassResult(
        map_50_95=_safe_float(out.get("map", 0.0)),
        map_50=_safe_float(out.get("map_50", 0.0)),
        map_75=_safe_float(out.get("map_75", 0.0)),
        per_category={},
    )


__all__ = ["CocoEvalResult", "PassResult", "coco_evaluate"]
