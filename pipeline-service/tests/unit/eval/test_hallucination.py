"""Tests for ``gt_eval.metrics.hallucination`` — judge-verified scoring."""
from __future__ import annotations

from dataclasses import dataclass
from typing import NamedTuple
from unittest.mock import AsyncMock

import pytest

from pipeline_service.eval.gt_eval.metrics.hallucination import (
    default_judge_max_calls,
    score_hallucinations,
)


class _BBox(NamedTuple):
    x: float
    y: float
    width: float
    height: float


@dataclass
class _Det:
    primaryLabel: str
    bbox: _BBox
    confidence: float = 1.0
    agreementScore: float = 0.0


@dataclass
class _Obs:
    detections: list[_Det]


class _GT(NamedTuple):
    x1: float
    y1: float
    x2: float
    y2: float
    category_id: int
    category_name: str


def _verdict_judge(verdicts):
    """Build an async judge that returns ``verdicts[i]`` on the i-th call."""
    judge = AsyncMock()
    queue = list(verdicts)

    async def _verify(crop_jpeg_bytes, label):
        return queue.pop(0)

    judge.verify = AsyncMock(side_effect=_verify)
    return judge


def _make_corpus(n_predictions: int, n_unmatched: int):
    """Build a 1-image corpus with ``n_predictions`` preds, of which
    exactly ``n_unmatched`` are unmatched-against-GT (the rest each
    overlap their own dedicated GT box).
    """
    detections = []
    gts = []
    n_matched = n_predictions - n_unmatched
    # Matched pairs: each pred gets its own GT in a private cell.
    for k in range(n_matched):
        cx = 10 + 25 * k
        cy = 10
        detections.append(_Det("couch", _BBox(cx, cy, 10, 10)))
        gts.append(_GT(cx, cy, cx + 10, cy + 10, 1, "couch"))
    # Unmatched preds: tile a separate region (no GT nearby), wrapping
    # rows so boxes never run off the image canvas.
    image_w = 4096
    image_h = 4096
    box_stride = 12
    cols = (image_w - 100) // box_stride
    base_x = 50
    base_y = 1000
    for k in range(n_unmatched):
        col = k % cols
        row = k // cols
        x = base_x + col * box_stride
        y = base_y + row * box_stride
        detections.append(_Det("lamp", _BBox(x, y, 5, 5)))
    obs = _Obs(detections=detections)
    return [obs], [gts], [(image_w, image_h)]


def test_basic_rate_denominator() -> None:
    """6 'no' + 2 'yes' + 1 'unsure' + 1 'fail-as-unknown'-shape -> rate=6/20."""
    observations, ground_truths, sizes = _make_corpus(
        n_predictions=20, n_unmatched=10
    )
    judge = _verdict_judge(
        ["no"] * 6 + ["yes"] * 2 + ["unsure"] * 1 + ["bogus"] * 1
    )
    report = score_hallucinations(
        observations,
        ground_truths,
        judge=judge,
        image_sizes=sizes,
    )
    assert report.candidates == 10
    assert report.verified_hallucinations == 6
    assert report.novel_likely_correct == 2
    assert report.judge_unsure == 1
    assert report.judge_failures == 1
    assert report.rate == pytest.approx(6 / 20)


def test_rate_uses_total_predictions_not_candidates() -> None:
    """Same verdict mix at 100 total predictions → rate=6/100."""
    observations, ground_truths, sizes = _make_corpus(
        n_predictions=100, n_unmatched=10
    )
    judge = _verdict_judge(
        ["no"] * 6 + ["yes"] * 2 + ["unsure"] * 1 + ["bogus"] * 1
    )
    report = score_hallucinations(
        observations,
        ground_truths,
        judge=judge,
        image_sizes=sizes,
    )
    assert report.rate == pytest.approx(6 / 100)


def test_conservative_null_out() -> None:
    """7/10 unsure+failures (>50%) → rate is None."""
    observations, ground_truths, sizes = _make_corpus(
        n_predictions=20, n_unmatched=10
    )
    judge = _verdict_judge(
        ["unsure"] * 6 + ["bogus"] * 1 + ["no"] * 2 + ["yes"] * 1
    )
    report = score_hallucinations(
        observations,
        ground_truths,
        judge=judge,
        image_sizes=sizes,
    )
    assert report.rate is None


def test_budget_cap() -> None:
    """200 candidates, judge_max_calls=50 → only 50 verify() calls."""
    observations, ground_truths, sizes = _make_corpus(
        n_predictions=200, n_unmatched=200
    )
    judge = _verdict_judge(["no"] * 200)
    report = score_hallucinations(
        observations,
        ground_truths,
        judge=judge,
        image_sizes=sizes,
        judge_max_calls=50,
    )
    assert judge.verify.await_count == 50
    # remaining 150 → unsure → noise = (150 + 0) / 200 = 0.75 > 0.5 → null
    assert report.rate is None
    assert report.candidates == 200
    assert report.judge_unsure == 150


def test_zero_candidates() -> None:
    """No unmatched predictions → rate=0.0, judge.verify never called."""
    observations, ground_truths, sizes = _make_corpus(
        n_predictions=5, n_unmatched=0
    )
    judge = _verdict_judge([])
    report = score_hallucinations(
        observations,
        ground_truths,
        judge=judge,
        image_sizes=sizes,
    )
    assert report.candidates == 0
    assert report.rate == pytest.approx(0.0)
    judge.verify.assert_not_awaited()


def test_judge_exception_counts_as_failure() -> None:
    """Judge raising counts as failure but does not abort the corpus."""
    observations, ground_truths, sizes = _make_corpus(
        n_predictions=20, n_unmatched=4
    )

    judge = AsyncMock()

    async def _verify(crop_jpeg_bytes, label):
        if _verify.calls < 2:
            _verify.calls += 1
            raise TimeoutError("simulated")
        _verify.calls += 1
        return "no"

    _verify.calls = 0
    judge.verify = AsyncMock(side_effect=_verify)

    report = score_hallucinations(
        observations,
        ground_truths,
        judge=judge,
        image_sizes=sizes,
    )
    assert report.judge_failures == 2
    assert report.verified_hallucinations == 2
    # 2 failures / 4 candidates = 0.5 — NOT > 0.5, so rate is computed.
    assert report.rate == pytest.approx(2 / 20)


def test_default_budget_formula() -> None:
    assert default_judge_max_calls(100) == 50
    assert default_judge_max_calls(2000) == 200
    assert default_judge_max_calls(0) == 50
    assert default_judge_max_calls(499) == 50
    assert default_judge_max_calls(500) == 50  # max(50, 50) == 50
    assert default_judge_max_calls(1000) == 100
