"""Tests for ``gt_eval.metrics.labels`` — label F1 + box-aware F1."""
from __future__ import annotations

from dataclasses import dataclass
from typing import NamedTuple

import pytest

from pipeline_service.eval.gt_eval.metrics.labels import LabelMetrics, label_f1


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


def _exact_matcher(predicted: str, gt: str) -> bool:
    return predicted.strip().lower() == gt.strip().lower()


def test_all_correct() -> None:
    """Every prediction has IoU>=0.5 AND label match."""
    obs = _Obs(
        detections=[
            _Det("couch", _BBox(0, 0, 10, 10)),
            _Det("lamp", _BBox(20, 20, 5, 5)),
        ]
    )
    gts = [
        _GT(0, 0, 10, 10, 1, "couch"),
        _GT(20, 20, 25, 25, 2, "lamp"),
    ]
    out = label_f1(
        [obs],
        [gts],
        label_matcher=_exact_matcher,
        image_sizes=[(100, 100)],
    )
    assert out.label_f1 == pytest.approx(1.0)
    assert out.box_aware_f1_50 == pytest.approx(1.0)
    assert out.label_precision == pytest.approx(1.0)
    assert out.label_recall == pytest.approx(1.0)


def test_all_wrong_labels() -> None:
    """No label matches → both F1s are 0."""
    obs = _Obs(
        detections=[
            _Det("orange", _BBox(0, 0, 10, 10)),
            _Det("apple", _BBox(20, 20, 5, 5)),
        ]
    )
    gts = [
        _GT(0, 0, 10, 10, 1, "couch"),
        _GT(20, 20, 25, 25, 2, "lamp"),
    ]
    out = label_f1(
        [obs],
        [gts],
        label_matcher=_exact_matcher,
        image_sizes=[(100, 100)],
    )
    assert out.label_f1 == pytest.approx(0.0)
    assert out.box_aware_f1_50 == pytest.approx(0.0)


def test_partial_match() -> None:
    """4 preds, 2 IoU+label correct, 1 IoU correct/wrong-label, 1 wrong IoU."""
    obs = _Obs(
        detections=[
            _Det("couch", _BBox(0, 0, 10, 10)),     # IoU+label correct
            _Det("lamp", _BBox(20, 20, 5, 5)),      # IoU+label correct
            _Det("couch", _BBox(40, 40, 5, 5)),     # IoU box correct, wrong label (gt is 'rug')
            _Det("couch", _BBox(80, 80, 5, 5)),     # no IoU match, label couch (matches gt[0] for label-F1)
        ]
    )
    gts = [
        _GT(0, 0, 10, 10, 1, "couch"),
        _GT(20, 20, 25, 25, 2, "lamp"),
        _GT(40, 40, 45, 45, 3, "rug"),
    ]
    out = label_f1(
        [obs],
        [gts],
        label_matcher=_exact_matcher,
        image_sizes=[(100, 100)],
    )
    # Label F1: predicted couch×3, lamp×1. GT: couch×1, lamp×1, rug×1.
    # Greedy label match: pred[0]=couch->gt[0]=couch (TP), pred[1]=lamp->gt[1]=lamp (TP),
    # pred[2]=couch -> no remaining couch GT (FP), pred[3]=couch -> no remaining couch GT (FP).
    # label_tp=2, label_fp=2, label_fn=1 (rug never matched). precision=2/4=0.5, recall=2/3≈0.667.
    assert out.label_precision == pytest.approx(0.5, abs=1e-6)
    assert out.label_recall == pytest.approx(2 / 3, abs=1e-6)
    assert out.label_f1 == pytest.approx(2 * 0.5 * (2 / 3) / (0.5 + 2 / 3), abs=1e-6)
    # Box-aware F1: 2 TP (preds 0,1), preds 2,3 are FPs (no label-match where IoU also overlaps).
    # GT rug never matched -> FN.
    assert out.box_aware_f1_50 < 1.0
    assert out.box_aware_f1_50 > 0.0


def test_label_only_metric_ignores_iou() -> None:
    """Pred with correct label but far box still counts toward label F1."""
    obs = _Obs(
        detections=[_Det("couch", _BBox(900, 900, 5, 5))]
    )
    gts = [_GT(0, 0, 10, 10, 1, "couch")]
    out = label_f1(
        [obs],
        [gts],
        label_matcher=_exact_matcher,
        image_sizes=[(1000, 1000)],
    )
    # Label F1 sees a match (1 pred, 1 gt, both 'couch'); box-aware sees no IoU.
    assert out.label_f1 == pytest.approx(1.0)
    assert out.box_aware_f1_50 == pytest.approx(0.0)


def test_zero_predictions_zero_gt_is_vacuous_one() -> None:
    obs = _Obs(detections=[])
    out = label_f1(
        [obs],
        [[]],
        label_matcher=_exact_matcher,
        image_sizes=[(100, 100)],
    )
    assert out == LabelMetrics(1.0, 1.0, 1.0, 1.0)


def test_zero_predictions_nonempty_gt_is_zero() -> None:
    obs = _Obs(detections=[])
    gts = [_GT(0, 0, 10, 10, 1, "couch")]
    out = label_f1(
        [obs],
        [gts],
        label_matcher=_exact_matcher,
        image_sizes=[(100, 100)],
    )
    assert out.label_f1 == pytest.approx(0.0)
    assert out.label_precision == pytest.approx(0.0)
    assert out.label_recall == pytest.approx(0.0)
