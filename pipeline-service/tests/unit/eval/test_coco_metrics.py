"""Tests for ``gt_eval.metrics.coco`` — dual-pass COCO mAP wrapper."""
from __future__ import annotations

from dataclasses import dataclass
from typing import NamedTuple

import pytest

from pipeline_service.eval.gt_eval.metrics import coco as coco_mod
from pipeline_service.eval.gt_eval.metrics.coco import (
    CocoEvalResult,
    PassResult,
    coco_evaluate,
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
    confidence: float = 0.9
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


def test_dual_pass_split_excludes_unmatched_from_class_aware() -> None:
    """Predictions whose label matches no GT category are excluded from
    the class-aware pass; the class-agnostic pass receives all of them.
    """
    obs = _Obs(
        detections=[
            _Det("couch", _BBox(0, 0, 10, 10)),    # label-matches GT
            _Det("lamp", _BBox(20, 20, 5, 5)),     # label-matches GT
            _Det("rug", _BBox(40, 40, 5, 5)),      # label-matches GT
            _Det("orange", _BBox(60, 60, 5, 5)),   # NO label match
            _Det("apple", _BBox(80, 80, 5, 5)),    # NO label match
        ]
    )
    gts = [
        _GT(0, 0, 10, 10, 1, "couch"),
        _GT(20, 20, 25, 25, 2, "lamp"),
        _GT(40, 40, 45, 45, 3, "rug"),
    ]
    result = coco_evaluate(
        [obs],
        [gts],
        label_matcher=_exact_matcher,
        image_sizes=[(200, 200)],
    )
    assert result.n_predictions == 5
    assert result.n_ground_truths == 3
    assert isinstance(result.class_aware, PassResult)
    assert isinstance(result.class_agnostic, PassResult)
    # class-agnostic pass uses one synthetic class
    assert result.class_agnostic.per_category in ({}, {})  # always empty
    # class-aware: per-category populated for matched LVIS names
    assert set(result.class_aware.per_category.keys()).issubset(
        {"couch", "lamp", "rug"}
    )


def test_empty_predictions_produces_zero_map() -> None:
    """No detections, non-empty GT → both passes return mAP=0."""
    obs = _Obs(detections=[])
    gts = [_GT(0, 0, 10, 10, 1, "couch")]
    result = coco_evaluate(
        [obs],
        [gts],
        label_matcher=_exact_matcher,
        image_sizes=[(100, 100)],
    )
    assert result.n_predictions == 0
    assert result.class_aware.map_50_95 == 0.0
    assert result.class_agnostic.map_50_95 == 0.0


def test_empty_ground_truths_masked_to_zero() -> None:
    """No GT, non-empty preds → wrapper returns 0.0 (NaN masked)."""
    obs = _Obs(detections=[_Det("couch", _BBox(0, 0, 10, 10))])
    result = coco_evaluate(
        [obs],
        [[]],
        label_matcher=_exact_matcher,
        image_sizes=[(100, 100)],
    )
    assert result.n_ground_truths == 0
    assert result.class_aware.map_50_95 == 0.0
    assert result.class_agnostic.map_50_95 == 0.0


def test_perfect_predictions_yield_high_map() -> None:
    """Predictions that exactly match GTs → mAP close to 1.0 on both passes."""
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
    result = coco_evaluate(
        [obs],
        [gts],
        label_matcher=_exact_matcher,
        image_sizes=[(200, 200)],
    )
    assert result.class_aware.map_50_95 > 0.8
    assert result.class_agnostic.map_50_95 > 0.8
    assert result.class_aware.map_50 == pytest.approx(1.0)


def test_per_category_only_populated_for_class_aware() -> None:
    """class-agnostic pass leaves ``per_category`` empty."""
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
    result = coco_evaluate(
        [obs],
        [gts],
        label_matcher=_exact_matcher,
        image_sizes=[(200, 200)],
    )
    assert result.class_agnostic.per_category == {}
    assert "couch" in result.class_aware.per_category
    assert "lamp" in result.class_aware.per_category


def test_confidence_zero_falls_back_to_agreement_score() -> None:
    """Detections with confidence=0 use agreementScore for ranking."""
    obs = _Obs(
        detections=[
            _Det(
                "couch",
                _BBox(0, 0, 10, 10),
                confidence=0.0,
                agreementScore=0.7,
            ),
        ]
    )
    gts = [_GT(0, 0, 10, 10, 1, "couch")]
    result = coco_evaluate(
        [obs],
        [gts],
        label_matcher=_exact_matcher,
        image_sizes=[(100, 100)],
    )
    assert result.class_aware.map_50 == pytest.approx(1.0)


def test_pycoco_backend_selected_in_test_env() -> None:
    """pycocotools is in the dependency declaration, so the wrapper picks it."""
    assert coco_mod._PYCOCO_AVAILABLE is True
    assert coco_mod._BACKEND_NAME == "pycocotools"


def test_returns_dataclass_result() -> None:
    obs = _Obs(detections=[])
    result = coco_evaluate(
        [obs],
        [[]],
        label_matcher=_exact_matcher,
        image_sizes=[(100, 100)],
    )
    assert isinstance(result, CocoEvalResult)
