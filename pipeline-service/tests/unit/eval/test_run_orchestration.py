"""Unit tests for the GT-eval synchronous orchestrator."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import NamedTuple
from unittest.mock import AsyncMock, MagicMock

import pytest

from pipeline_service.eval.gt_eval.run import (
    GtEvalConfig,
    PipelineFailureRateExceeded,
    PreflightFailed,
    run_gt_eval,
)
from pipeline_service.types import OpError, SceneObservation


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


class _GT(NamedTuple):
    x1: float
    y1: float
    x2: float
    y2: float
    category_id: int
    category_name: str


class _DS:
    """Tiny EvalDataset stand-in."""

    def __init__(self, pairs):
        self._pairs = pairs

    def __iter__(self):
        return iter(self._pairs)


def _exact_matcher(a: str, b: str) -> bool:
    return a.strip().lower() == b.strip().lower()


def _ok_health() -> None:
    return None


def _make_obs(scene_id, dets):
    obs = SceneObservation.empty(scene_id=scene_id, run_id="r", frame_ids=["f"])
    return obs.model_copy(update={"detections": dets})


def test_run_gt_eval_is_synchronous() -> None:
    assert not asyncio.iscoroutinefunction(run_gt_eval)


def test_iterates_dataset_and_calls_runner_once_per_image(tmp_path: Path) -> None:
    paths = [tmp_path / f"img-{i}.jpg" for i in range(3)]
    for p in paths:
        p.write_bytes(b"\xff\xd8\xff\xe0fake")
    pairs = [
        (paths[0], [_GT(0, 0, 10, 10, 1, "couch")]),
        (paths[1], [_GT(0, 0, 10, 10, 1, "couch")]),
        (paths[2], [_GT(0, 0, 10, 10, 1, "couch")]),
    ]
    ds = _DS(pairs)

    runner_calls = []

    def runner(image_path):
        runner_calls.append(image_path)
        return _make_obs(f"s-{image_path.stem}", [_Det("couch", _BBox(0, 0, 10, 10))])

    block = run_gt_eval(
        GtEvalConfig(),
        ds,
        runner,
        detection_health_check=_ok_health,
        label_matcher=_exact_matcher,
    )
    # 1 warm-up + 3 timed-loop = 4 total
    assert len(runner_calls) == 4
    assert block.n_images == 3
    assert block.n_predictions == 3
    assert block.n_ground_truths == 3


def test_preflight_failure_raises(tmp_path: Path) -> None:
    def bad_health():
        raise PreflightFailed("detection-service down")

    with pytest.raises(PreflightFailed):
        run_gt_eval(
            GtEvalConfig(),
            _DS([]),
            lambda p: _make_obs("x", []),
            detection_health_check=bad_health,
            label_matcher=_exact_matcher,
        )


def test_preflight_unexpected_exception_wrapped(tmp_path: Path) -> None:
    def bad_health():
        raise ConnectionError("boom")

    with pytest.raises(PreflightFailed):
        run_gt_eval(
            GtEvalConfig(),
            _DS([]),
            lambda p: _make_obs("x", []),
            detection_health_check=bad_health,
            label_matcher=_exact_matcher,
        )


def test_empty_dataset_returns_zero_block(tmp_path: Path) -> None:
    block = run_gt_eval(
        GtEvalConfig(),
        _DS([]),
        lambda p: _make_obs("x", []),
        detection_health_check=_ok_health,
        label_matcher=_exact_matcher,
    )
    assert block.n_images == 0
    assert block.headline.class_aware_map_50_95 == 0.0
    assert block.headline.hallucination_rate is None


def test_warmup_failure_does_not_raise(tmp_path: Path) -> None:
    paths = [tmp_path / "x.jpg"]
    paths[0].write_bytes(b"\xff\xd8\xff\xe0fake")
    pairs = [(paths[0], [_GT(0, 0, 10, 10, 1, "couch")])]

    seen = {"calls": 0}

    def runner(image_path):
        seen["calls"] += 1
        if seen["calls"] == 1:
            raise RuntimeError("warm-up boom")
        return _make_obs("s", [_Det("couch", _BBox(0, 0, 10, 10))])

    block = run_gt_eval(
        GtEvalConfig(),
        _DS(pairs),
        runner,
        detection_health_check=_ok_health,
        label_matcher=_exact_matcher,
    )
    assert block.n_images == 1


def test_pipeline_failure_rate_exceeded_raises(tmp_path: Path) -> None:
    paths = [tmp_path / f"img-{i}.jpg" for i in range(20)]
    for p in paths:
        p.write_bytes(b"\xff\xd8\xff\xe0fake")
    pairs = [(p, [_GT(0, 0, 10, 10, 1, "couch")]) for p in paths]

    def flagged_runner(image_path):
        obs = _make_obs(f"s-{image_path.stem}", [])
        return obs.model_copy(
            update={
                "flagged": True,
                "errors": [OpError(op="x", code="E", message="m")],
            }
        )

    with pytest.raises(PipelineFailureRateExceeded):
        run_gt_eval(
            GtEvalConfig(),
            _DS(pairs),
            flagged_runner,
            detection_health_check=_ok_health,
            label_matcher=_exact_matcher,
        )


def test_judge_plumbed_when_provided(tmp_path: Path) -> None:
    paths = [tmp_path / "x.jpg"]
    paths[0].write_bytes(b"\xff\xd8\xff\xe0fake")
    pairs = [(paths[0], [_GT(0, 0, 10, 10, 1, "couch")])]

    judge = MagicMock()
    judge.verify = AsyncMock(return_value="no")

    def runner(image_path):
        return _make_obs(
            "s",
            [
                _Det("couch", _BBox(0, 0, 10, 10)),
                _Det("lamp", _BBox(900, 900, 5, 5)),
            ],
        )

    block = run_gt_eval(
        GtEvalConfig(judge=judge),
        _DS(pairs),
        runner,
        detection_health_check=_ok_health,
        label_matcher=_exact_matcher,
    )
    judge.verify.assert_awaited()
    assert block.headline.hallucination_rate is not None


def test_judge_none_yields_null_hallucination_rate(tmp_path: Path) -> None:
    paths = [tmp_path / "x.jpg"]
    paths[0].write_bytes(b"\xff\xd8\xff\xe0fake")
    pairs = [(paths[0], [_GT(0, 0, 10, 10, 1, "couch")])]

    def runner(image_path):
        return _make_obs(
            "s", [_Det("lamp", _BBox(900, 900, 5, 5))]
        )

    block = run_gt_eval(
        GtEvalConfig(judge=None),
        _DS(pairs),
        runner,
        detection_health_check=_ok_health,
        label_matcher=_exact_matcher,
    )
    assert block.headline.hallucination_rate is None
    assert block.headline.judge_unsure == 0


def test_metric_floats_rounded_to_three_decimals(tmp_path: Path) -> None:
    paths = [tmp_path / "x.jpg"]
    paths[0].write_bytes(b"\xff\xd8\xff\xe0fake")
    pairs = [(paths[0], [_GT(0, 0, 10, 10, 1, "couch")])]

    def runner(image_path):
        return _make_obs(
            "s", [_Det("couch", _BBox(0, 0, 10, 10))]
        )

    block = run_gt_eval(
        GtEvalConfig(),
        _DS(pairs),
        runner,
        detection_health_check=_ok_health,
        label_matcher=_exact_matcher,
    )
    for f in (
        block.headline.class_aware_map_50_95,
        block.headline.class_aware_map_50,
        block.headline.label_f1,
        block.headline.box_f1_50,
    ):
        assert round(f, 3) == f
