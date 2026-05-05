"""Tests for IoU computation + Hungarian box assignment.

All boxes are pixel coords. Predictions are xywh, GT is xyxy. Max edges
exclusive (touching boxes have IoU 0.0).
"""
from __future__ import annotations

import math
from dataclasses import FrozenInstanceError
from typing import NamedTuple

import pytest

from pipeline_service.eval.gt_eval.matchers import iou as iou_mod
from pipeline_service.eval.gt_eval.matchers.iou import (
    Match,
    _iou_xyxy,
    _xywh_to_xyxy_clamped,
    match_boxes,
)


class _Pred(NamedTuple):
    """Lightweight prediction stand-in (xywh)."""

    x: float
    y: float
    width: float
    height: float


class _GT(NamedTuple):
    """Lightweight GT stand-in (xyxy, max-exclusive)."""

    x1: float
    y1: float
    x2: float
    y2: float


# ---------- IoU primitive ---------------------------------------------------


class TestIouComputation:
    def test_identical_boxes_iou_is_1(self) -> None:
        assert _iou_xyxy((0, 0, 10, 10), (0, 0, 10, 10)) == pytest.approx(1.0)

    def test_touching_boxes_iou_is_0(self) -> None:
        assert _iou_xyxy((0, 0, 10, 10), (10, 0, 20, 10)) == 0.0

    def test_disjoint_boxes_iou_is_0(self) -> None:
        assert _iou_xyxy((0, 0, 10, 10), (20, 20, 30, 30)) == 0.0

    def test_known_iou_values(self) -> None:
        # Two 10x10 boxes overlapping in a 5x5 area.
        # inter=25, union=100+100-25=175, IoU=25/175 ≈ 0.142857
        assert _iou_xyxy((0, 0, 10, 10), (5, 5, 15, 15)) == pytest.approx(
            25 / 175, abs=1e-9
        )
        # IoU = 0.5: pred (0,0,10,10) and gt (0,0,10,5) → inter=50, union=150-50=100? wait that's IoU=0.5
        # area_a=100, area_b=50, inter=50, union=100+50-50=100, iou=0.5
        assert _iou_xyxy((0, 0, 10, 10), (0, 0, 10, 5)) == pytest.approx(0.5)
        # IoU = 0.6: area_a=100, area_b=60, inter=60 -> union=100, iou=0.6
        assert _iou_xyxy((0, 0, 10, 10), (0, 0, 10, 6)) == pytest.approx(0.6)

    def test_pred_fully_inside_gt(self) -> None:
        # pred 5x5 inside gt 20x20 -> inter=25, union=400, IoU=0.0625
        assert _iou_xyxy((5, 5, 10, 10), (0, 0, 20, 20)) == pytest.approx(0.0625)


# ---------- xywh -> xyxy conversion + clamping ------------------------------


class TestXywhToXyxy:
    def test_basic_conversion(self) -> None:
        assert _xywh_to_xyxy_clamped(10, 20, 30, 40, 1000, 1000) == (
            10.0,
            20.0,
            40.0,
            60.0,
        )

    def test_zero_origin(self) -> None:
        assert _xywh_to_xyxy_clamped(0, 0, 10, 10, 1000, 1000) == (
            0.0,
            0.0,
            10.0,
            10.0,
        )


class TestImageBoundClamping:
    def test_negative_origin_clamped(self) -> None:
        # x=-5,w=20 -> raw xyxy=(-5,..,15,..). After clamp: (0,..,15,..)
        assert _xywh_to_xyxy_clamped(-5, 10, 20, 20, 100, 100) == (
            0.0,
            10.0,
            15.0,
            30.0,
        )

    def test_overflow_max_clamped(self) -> None:
        # x=90,w=20 -> raw xyxy=(90,..,110,..). After clamp: (90,..,100,..)
        assert _xywh_to_xyxy_clamped(90, 90, 20, 20, 100, 100) == (
            90.0,
            90.0,
            100.0,
            100.0,
        )

    def test_fully_outside_becomes_zero_area(self) -> None:
        # x=200,y=200 fully outside 100x100 image -> zero area.
        x1, y1, x2, y2 = _xywh_to_xyxy_clamped(200, 200, 10, 10, 100, 100)
        assert x2 == x1 or y2 == y1


# ---------- Zero-area filter -----------------------------------------------


class TestZeroAreaFilter:
    def test_zero_width_dropped(self) -> None:
        preds = [_Pred(0, 0, 0, 10)]
        gts = [_GT(0, 0, 10, 10)]
        matches, unmatched_pred, unmatched_gt = match_boxes(
            preds, gts, iou_threshold=0.5, image_width=100, image_height=100
        )
        assert matches == []
        assert unmatched_pred == []  # filtered before matching
        assert unmatched_gt == [0]

    def test_zero_height_dropped(self) -> None:
        preds = [_Pred(0, 0, 10, 0)]
        gts = [_GT(0, 0, 10, 10)]
        matches, unmatched_pred, unmatched_gt = match_boxes(
            preds, gts, iou_threshold=0.5, image_width=100, image_height=100
        )
        assert matches == []
        assert unmatched_pred == []
        assert unmatched_gt == [0]


# ---------- Hungarian assignment -------------------------------------------


class TestMatchBoxesHungarian:
    def test_empty_inputs(self) -> None:
        assert match_boxes(
            [], [], iou_threshold=0.5, image_width=100, image_height=100
        ) == ([], [], [])

    def test_no_predictions(self) -> None:
        gts = [_GT(0, 0, 5, 5), _GT(10, 10, 15, 15), _GT(20, 20, 25, 25)]
        matches, unmatched_pred, unmatched_gt = match_boxes(
            [], gts, iou_threshold=0.5, image_width=100, image_height=100
        )
        assert matches == []
        assert unmatched_pred == []
        assert unmatched_gt == [0, 1, 2]

    def test_no_ground_truths(self) -> None:
        preds = [_Pred(0, 0, 5, 5), _Pred(10, 10, 5, 5), _Pred(20, 20, 5, 5)]
        matches, unmatched_pred, unmatched_gt = match_boxes(
            preds, [], iou_threshold=0.5, image_width=100, image_height=100
        )
        assert matches == []
        assert unmatched_pred == [0, 1, 2]
        assert unmatched_gt == []

    def test_simple_one_to_one(self) -> None:
        preds = [_Pred(0, 0, 10, 10)]
        gts = [_GT(0, 0, 10, 10)]
        matches, unmatched_pred, unmatched_gt = match_boxes(
            preds, gts, iou_threshold=0.5, image_width=100, image_height=100
        )
        assert len(matches) == 1
        assert matches[0].pred_idx == 0
        assert matches[0].gt_idx == 0
        assert matches[0].iou == pytest.approx(1.0)
        assert unmatched_pred == []
        assert unmatched_gt == []

    def test_below_threshold_unmatched(self) -> None:
        # IoU = 25/175 ≈ 0.143 — well below 0.5
        preds = [_Pred(0, 0, 10, 10)]
        gts = [_GT(5, 5, 15, 15)]
        matches, unmatched_pred, unmatched_gt = match_boxes(
            preds, gts, iou_threshold=0.5, image_width=100, image_height=100
        )
        assert matches == []
        assert unmatched_pred == [0]
        assert unmatched_gt == [0]

    def test_hungarian_optimal_on_ambiguous_3x3(self) -> None:
        """Pin Hungarian's optimal assignment on the 3x3 ambiguous case.

        Constructed so that the IoU matrix (within 1 decimal place):
            iou(A,1)=0.80  iou(A,2)=0.70  iou(A,3)=0.00
            iou(B,1)=0.79  iou(B,2)=0.00  iou(B,3)=0.00
            iou(C,1)=0.00  iou(C,2)=0.00  iou(C,3)=0.85

        Hungarian's optimal: (A,2)+(B,1)+(C,3).
        """
        # Build via direct xyxy construction. Predictions are xywh, so for
        # exact IoU we use the xywh form (x, y, w, h) where w=x2-x1.
        # GT 1 is at (0,0,10,10). Pred A overlaps it 80%, Pred B overlaps it 79%.
        # GT 2 is at (20,0,30,10). Pred A overlaps it ≈70% (need second high overlap).
        # Easiest: hand-compute IoU values via box construction.

        # IoU 0.8: pred (0,0,10,10), gt (0,0,9,9) -> inter=81, union=100+81-81=100, IoU=0.81
        # That's close enough to 0.8 in spirit. We'll instead engineer with exact arithmetic:
        # area_a=area_b=100, IoU = inter/(200-inter). Solve inter/(200-inter)=0.8 -> inter=160/1.8≈88.89
        # Use a 10x10 pred and 10x10 gt with overlap rectangle 8.888x10? Easier to use ints:
        # If pred=(0,0,10,10) and gt=(1,0,11,10): inter=9*10=90, union=100+100-90=110, IoU=90/110≈0.818
        # We don't need exact 0.80 — the test only needs Hungarian to BEAT greedy. So as long as the
        # iou matrix shape is right (A>B>C ordering on column 1, with A's column-2 alternative), greedy
        # picks (A,1) first then can't get (B,col) >= 0.5 for B; Hungarian assigns (A,2)+(B,1)+(C,3).
        #
        # Construct the matrix:
        #   A overlaps GT1 by 90/110 = 0.818, GT2 by 80/120 = 0.667
        #   B overlaps GT1 by 80/120 = 0.667
        #   C overlaps GT3 by 90/110 = 0.818
        preds = [
            _Pred(0, 0, 10, 10),     # A
            _Pred(2, 0, 10, 10),     # B (overlaps GT1 with 80% area? compute below)
            _Pred(20, 0, 10, 10),    # C
        ]
        # GT1 at (1,0,11,10): inter w/ A = (10-1)*10 = 90; with B = ((10+2)-2)*10? Actually
        #   B is xywh (2,0,10,10) -> xyxy (2,0,12,10).  GT1 xyxy (1,0,11,10).
        #   inter = (min(11,12)-max(1,2))*(10-0) = (11-2)*10 = 90. Hmm same as A.
        # Let's space them: B at (3,0,10,10) -> xyxy (3,0,13,10). inter w/ GT1=(11-3)*10=80. Good.
        preds = [
            _Pred(0, 0, 10, 10),     # A (xyxy 0,0,10,10)
            _Pred(3, 0, 10, 10),     # B (xyxy 3,0,13,10) — overlap w/ GT1 = 80 -> IoU=80/120≈0.667
            _Pred(20, 0, 10, 10),    # C (xyxy 20,0,30,10)
        ]
        gts = [
            _GT(1, 0, 11, 10),   # GT1 — inter A = (10-1)*10=90 -> IoU 90/110≈0.818
            _GT(0, 0, 8, 10),    # GT2 — inter A = 8*10=80 -> IoU 80/100? union=100+80-80=100 -> IoU=0.8
            _GT(21, 0, 31, 10),  # GT3 — inter C = (30-21)*10=90 -> IoU 90/110≈0.818
        ]
        matches, unmatched_pred, unmatched_gt = match_boxes(
            preds, gts, iou_threshold=0.5, image_width=100, image_height=100
        )

        # Hungarian's optimal is (A,2)+(B,1)+(C,3) = 0.8+0.667+0.818 = 2.285
        # Greedy would pick (A,1)=0.818, (C,3)=0.818, then B can't match GT2 (no overlap)
        #   so B remains unmatched: total = 1.636.
        # Verify all three matched, and the (A->2), (B->1), (C->3) pattern.
        match_dict = {m.pred_idx: m.gt_idx for m in matches}
        assert match_dict == {0: 1, 1: 0, 2: 2}
        # Sum-of-IoUs sanity: > greedy's would-be 1.636
        total_iou = sum(m.iou for m in matches)
        assert total_iou == pytest.approx(0.8 + (80 / 120) + (90 / 110), abs=1e-6)
        assert unmatched_pred == []
        assert unmatched_gt == []

    def test_match_dataclass_is_frozen(self) -> None:
        m = Match(pred_idx=0, gt_idx=1, iou=0.5)
        with pytest.raises(FrozenInstanceError):
            m.pred_idx = 99  # type: ignore[misc]

    def test_xywh_input_converts_internally(self) -> None:
        preds = [_Pred(10, 20, 30, 40)]  # xyxy 10,20,40,60
        gts = [_GT(10, 20, 40, 60)]
        matches, _, _ = match_boxes(
            preds, gts, iou_threshold=0.5, image_width=100, image_height=100
        )
        assert len(matches) == 1
        assert matches[0].iou == pytest.approx(1.0)

    def test_clamping_applied_before_iou(self) -> None:
        # Pred at (-5,10,20,20) clamped to xyxy (0,10,15,30).
        preds = [_Pred(-5, 10, 20, 20)]
        gts = [_GT(0, 10, 15, 30)]
        matches, _, _ = match_boxes(
            preds, gts, iou_threshold=0.5, image_width=100, image_height=100
        )
        assert len(matches) == 1
        assert matches[0].iou == pytest.approx(1.0)


def test_hungarian_backend_is_available_in_test_env() -> None:
    """Smoke test: scipy is in the dependency declaration."""
    assert iou_mod._HUNGARIAN_AVAILABLE is True


def test_greedy_fallback_runs_correctly_when_invoked() -> None:
    """Direct test of the greedy fallback (the helper is independently testable)."""
    import numpy as np

    matrix = np.array(
        [
            [0.818, 0.8, 0.0],
            [0.667, 0.0, 0.0],
            [0.0, 0.0, 0.818],
        ]
    )
    pairs = iou_mod._greedy_assignment(matrix, iou_threshold=0.5)
    # Greedy: (0,0)=0.818 first, (2,2)=0.818 next, (1,?)=0.667 left? (1,0) blocked, (1,1)=0
    # so only two matches.
    pair_set = {(i, j) for i, j in pairs}
    assert (0, 0) in pair_set
    assert (2, 2) in pair_set
    assert len(pairs) == 2  # B left unmatched

    _ = math  # silence unused-import lint for the file
