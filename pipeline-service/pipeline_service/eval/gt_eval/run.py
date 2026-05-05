"""GT-eval synchronous orchestrator.

Stitches together the dataset (§02), pipeline runner (§07), matchers
(§03), judges (§04), metric modules (§05), and baseline persistence
(§06) into one ``run_gt_eval`` entry point.

The function is **synchronous**. The judge's ``verify`` is async only
because the underlying ``OllamaClient`` is async; the hallucination
metric module wraps that with ``asyncio.run``. This entry point itself
never awaits.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Callable, Optional

from pipeline_service.eval.gt_eval.baseline import (
    CategoryAP,
    GtMetricsBlock,
    HeadlineMetrics,
)
from pipeline_service.eval.gt_eval.metrics import (
    coco_evaluate,
    label_f1,
    score_hallucinations,
)

logger = logging.getLogger(__name__)


class PreflightFailed(RuntimeError):
    """Raised when ``detection_health_check`` reports unhealthy."""


class PipelineFailureRateExceeded(RuntimeError):
    """Raised when >= 5% of images fail pipeline runs."""


@dataclass(frozen=True)
class GtEvalConfig:
    """Configuration for one ``run_gt_eval`` invocation."""

    sample_size: int = 500
    label_match_threshold: float = 0.6
    iou_threshold: float = 0.5
    judge: Optional[Any] = None
    judge_max_calls: Optional[int] = None
    write_baseline: bool = False
    apply_eval_skip_sahi: bool = False
    apply_eval_top_k: Optional[int] = None
    pipeline_failure_rate_max: float = 0.05


def _round_headline(h: HeadlineMetrics) -> HeadlineMetrics:
    return HeadlineMetrics(
        class_aware_map_50_95=round(h.class_aware_map_50_95, 3),
        class_aware_map_50=round(h.class_aware_map_50, 3),
        class_agnostic_map_50_95=round(h.class_agnostic_map_50_95, 3),
        class_agnostic_map_50=round(h.class_agnostic_map_50, 3),
        label_f1=round(h.label_f1, 3),
        box_f1_50=round(h.box_f1_50, 3),
        hallucination_rate=(
            None if h.hallucination_rate is None else round(h.hallucination_rate, 3)
        ),
        novel_likely_correct=int(h.novel_likely_correct),
        judge_unsure=int(h.judge_unsure),
    )


def _build_top_bottom(per_category):
    items = [
        CategoryAP(category=name, ap=round(float(ap), 3))
        for name, ap in per_category.items()
    ]
    by_desc = sorted(items, key=lambda c: c.ap, reverse=True)[:10]
    by_asc = sorted(items, key=lambda c: c.ap)[:10]
    return by_desc, by_asc


def _image_size_from_path(p):
    try:
        from PIL import Image

        with Image.open(p) as img:
            return int(img.width), int(img.height)
    except Exception:
        return 4096, 4096


def run_gt_eval(
    config: GtEvalConfig,
    dataset,
    pipeline_runner: Callable[[Any], Any],
    *,
    detection_health_check: Callable[[], None],
    label_matcher,
) -> GtMetricsBlock:
    """Run the synchronous GT-eval orchestrator and return a ``GtMetricsBlock``."""
    try:
        detection_health_check()
    except PreflightFailed:
        raise
    except Exception as exc:
        raise PreflightFailed(f"detection-service preflight failed: {exc}") from exc

    pairs = list(dataset)

    if not pairs:
        empty_headline = HeadlineMetrics(
            class_aware_map_50_95=0.0,
            class_aware_map_50=0.0,
            class_agnostic_map_50_95=0.0,
            class_agnostic_map_50=0.0,
            label_f1=0.0,
            box_f1_50=0.0,
            hallucination_rate=None,
            novel_likely_correct=0,
            judge_unsure=0,
        )
        return GtMetricsBlock(
            headline=empty_headline,
            per_class_top10=[],
            per_class_bottom10=[],
            n_images=0,
            n_predictions=0,
            n_ground_truths=0,
            runtime_s=0.0,
        )

    warm_image_path, _gt = pairs[0]
    try:
        pipeline_runner(warm_image_path)
    except Exception as exc:
        logger.warning("Warm-up runner raised %s; continuing", type(exc).__name__)

    n_images = len(pairs)
    observations = []
    ground_truths = []
    image_sizes = []
    image_bytes = []
    n_pipeline_failures = 0

    started = time.perf_counter()
    for image_path, gt_boxes in pairs:
        try:
            obs = pipeline_runner(image_path)
        except Exception as exc:
            logger.warning(
                "pipeline_runner raised %s on %s; counting as failure",
                type(exc).__name__,
                image_path,
            )
            n_pipeline_failures += 1
            continue
        if getattr(obs, "flagged", False):
            n_pipeline_failures += 1
            continue
        observations.append(obs)
        ground_truths.append(list(gt_boxes))
        image_sizes.append(_image_size_from_path(image_path))
        try:
            image_bytes.append(image_path.read_bytes())
        except Exception:
            image_bytes.append(None)

    runtime_s = time.perf_counter() - started

    if n_images > 0 and n_pipeline_failures / n_images >= config.pipeline_failure_rate_max:
        raise PipelineFailureRateExceeded(
            f"{n_pipeline_failures}/{n_images} pipeline runs failed "
            f"(rate={n_pipeline_failures / n_images:.3f} >= "
            f"{config.pipeline_failure_rate_max:.3f})"
        )

    coco_result = coco_evaluate(
        observations,
        ground_truths,
        label_matcher=label_matcher,
        image_sizes=image_sizes,
    )
    label_metrics = label_f1(
        observations,
        ground_truths,
        label_matcher=label_matcher,
        image_sizes=image_sizes,
        iou_threshold=config.iou_threshold,
    )
    if config.judge is not None and observations:
        hall_report = score_hallucinations(
            observations,
            ground_truths,
            judge=config.judge,
            image_sizes=image_sizes,
            image_bytes=image_bytes,
            iou_threshold=config.iou_threshold,
            judge_max_calls=config.judge_max_calls,
        )
        hallucination_rate = hall_report.rate
        novel_likely_correct = hall_report.novel_likely_correct
        judge_unsure = hall_report.judge_unsure
    else:
        hallucination_rate = None
        novel_likely_correct = 0
        judge_unsure = 0

    n_predictions = sum(len(getattr(o, "detections", [])) for o in observations)
    n_ground_truths = sum(len(g) for g in ground_truths)

    headline = HeadlineMetrics(
        class_aware_map_50_95=coco_result.class_aware.map_50_95,
        class_aware_map_50=coco_result.class_aware.map_50,
        class_agnostic_map_50_95=coco_result.class_agnostic.map_50_95,
        class_agnostic_map_50=coco_result.class_agnostic.map_50,
        label_f1=label_metrics.label_f1,
        box_f1_50=label_metrics.box_aware_f1_50,
        hallucination_rate=hallucination_rate,
        novel_likely_correct=novel_likely_correct,
        judge_unsure=judge_unsure,
    )

    top10, bottom10 = _build_top_bottom(coco_result.class_aware.per_category)

    return GtMetricsBlock(
        headline=_round_headline(headline),
        per_class_top10=top10,
        per_class_bottom10=bottom10,
        n_images=n_images - n_pipeline_failures,
        n_predictions=n_predictions,
        n_ground_truths=n_ground_truths,
        runtime_s=round(runtime_s, 1),
    )


__all__ = [
    "GtEvalConfig",
    "PipelineFailureRateExceeded",
    "PreflightFailed",
    "run_gt_eval",
]
