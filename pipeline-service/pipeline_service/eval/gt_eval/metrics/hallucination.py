"""Hallucination metric — judge-verified scoring of unmatched predictions.

A *candidate* is a predicted detection with no GT box at IoU >= 0.5
(per ``match_boxes``'s ``unmatched_pred_idxs``). Each candidate is sent
to the configured ``ReferenceModelJudge`` for a binary verdict in
``{'yes', 'no', 'unsure'}``.

Bookkeeping rules:
  * ``verified_hallucinations`` = count of ``verdict == 'no'``.
  * ``novel_likely_correct``    = count of ``verdict == 'yes'``.
  * ``judge_unsure``            = count of ``verdict == 'unsure'``.
  * ``judge_failures``          = count of judge invocations that
                                  raised or returned a non-verdict.

Rate denominator is ``total_predictions`` (NOT ``candidates``) — keeps
the metric monotone as the matcher improves.

Conservative null-out: when
    (judge_unsure + judge_failures) / max(candidates, 1) > 0.5
the rate is set to ``None``. The orchestrator and baseline gate treat
``None`` as "metric unknown — gate skipped".

Budget cap: ``judge_max_calls`` defaults to
    max(50, int(0.1 * total_predictions))
Once hit, remaining candidates are bucketed ``judge_unsure``.

Public surface: ``score_hallucinations``, ``HallucinationReport``,
``default_judge_max_calls``.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Optional, Sequence

from pipeline_service.eval.gt_eval.matchers.iou import match_boxes

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class HallucinationReport:
    """Report shape returned by ``score_hallucinations``."""

    rate: Optional[float]
    candidates: int
    verified_hallucinations: int
    novel_likely_correct: int
    judge_unsure: int
    judge_failures: int


def default_judge_max_calls(total_predictions: int) -> int:
    """``max(50, int(0.1 * total_predictions))`` — global judge budget."""
    return max(50, int(0.1 * total_predictions))


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


def _crop_bytes_for_detection(image_bytes: Optional[bytes], det: Any) -> bytes:
    """Best-effort crop of ``det.bbox`` from ``image_bytes``.

    When ``image_bytes`` is None (test fast-path / orchestrator chose to
    skip image I/O), return an empty byte string. The judge's RoI
    expansion + decode-failure-fallback handles non-image inputs
    gracefully (returns ``"unsure"`` via JSON parse failure).
    """
    if not image_bytes:
        return b""
    try:
        import io as _io

        from PIL import Image
    except ImportError:  # pragma: no cover -- Pillow is a hard dep
        return image_bytes
    try:
        with Image.open(_io.BytesIO(image_bytes)) as img:
            img.load()
            x, y, w, h = _detection_xywh(det)
            x1 = max(0, int(round(x)))
            y1 = max(0, int(round(y)))
            x2 = min(img.width, int(round(x + w)))
            y2 = min(img.height, int(round(y + h)))
            if x2 <= x1 or y2 <= y1:
                return image_bytes
            crop = img.crop((x1, y1, x2, y2)).convert("RGB")
            buf = _io.BytesIO()
            crop.save(buf, format="JPEG", quality=92)
            return buf.getvalue()
    except (OSError, ValueError):
        return image_bytes


def score_hallucinations(
    observations: Sequence[Any],
    ground_truths: Sequence[Sequence[Any]],
    *,
    judge,
    image_sizes: Sequence[tuple[int, int]] | None = None,
    image_bytes: Sequence[Optional[bytes]] | None = None,
    iou_threshold: float = 0.5,
    judge_max_calls: Optional[int] = None,
) -> HallucinationReport:
    """Walk the corpus, score each unmatched prediction with the judge."""
    if image_sizes is None:
        image_sizes = [(4096, 4096) for _ in observations]
    if image_bytes is None:
        image_bytes = [None for _ in observations]
    if not (
        len(observations) == len(ground_truths) == len(image_sizes) == len(image_bytes)
    ):
        raise ValueError("score_hallucinations: input length mismatch")

    total_predictions = sum(len(getattr(o, "detections", [])) for o in observations)
    effective_max = (
        judge_max_calls
        if judge_max_calls is not None
        else default_judge_max_calls(total_predictions)
    )
    if effective_max < 0:
        effective_max = 0

    candidates: list[tuple[Any, Optional[bytes]]] = []
    for obs, gts, (w, h), img_bytes in zip(
        observations, ground_truths, image_sizes, image_bytes
    ):
        detections = list(getattr(obs, "detections", []))
        if not detections:
            continue
        _matches, unmatched_pred_idxs, _unmatched_gt = match_boxes(
            detections,
            gts,
            iou_threshold=iou_threshold,
            image_width=int(w),
            image_height=int(h),
        )
        for idx in unmatched_pred_idxs:
            candidates.append((detections[idx], img_bytes))

    n_candidates = len(candidates)
    if n_candidates == 0:
        return HallucinationReport(
            rate=0.0,
            candidates=0,
            verified_hallucinations=0,
            novel_likely_correct=0,
            judge_unsure=0,
            judge_failures=0,
        )

    verified = 0
    novel = 0
    unsure = 0
    failures = 0
    calls_made = 0

    async def _run_all() -> None:
        nonlocal verified, novel, unsure, failures, calls_made
        for det, img_bytes in candidates:
            if calls_made >= effective_max:
                unsure += 1
                continue
            label = _detection_label(det)
            crop = _crop_bytes_for_detection(img_bytes, det)
            try:
                verdict = await judge.verify(crop, label)
            except Exception as exc:  # noqa: BLE001 — defensive bookkeeping
                logger.warning(
                    "score_hallucinations: judge raised %s — counting as failure",
                    type(exc).__name__,
                )
                failures += 1
                calls_made += 1
                continue
            calls_made += 1
            if verdict == "no":
                verified += 1
            elif verdict == "yes":
                novel += 1
            elif verdict == "unsure":
                unsure += 1
            else:
                failures += 1

    asyncio.run(_run_all())

    noise = (unsure + failures) / max(n_candidates, 1)
    if noise > 0.5:
        rate: Optional[float] = None
    elif total_predictions == 0:
        rate = 0.0
    else:
        rate = verified / total_predictions

    logger.info(
        "score_hallucinations: total_predictions=%d candidates=%d "
        "verified=%d novel=%d unsure=%d failures=%d calls_made=%d rate=%s",
        total_predictions,
        n_candidates,
        verified,
        novel,
        unsure,
        failures,
        calls_made,
        rate,
    )
    return HallucinationReport(
        rate=rate,
        candidates=n_candidates,
        verified_hallucinations=verified,
        novel_likely_correct=novel,
        judge_unsure=unsure,
        judge_failures=failures,
    )


__all__ = [
    "HallucinationReport",
    "default_judge_max_calls",
    "score_hallucinations",
]
