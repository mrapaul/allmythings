"""End-to-end integration test for the GT-eval harness.

Uses a hand-built fixture dataset (5 ``(image_path, gt_boxes)`` pairs)
plus a fixture pipeline runner that returns deterministic
``SceneObservation`` objects — no Dagster, no models, no network. Plus
a deterministic mock judge.

This test runs in CI on every push.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import NamedTuple
from unittest.mock import AsyncMock, MagicMock

import pytest

from pipeline_service.eval.gt_eval.run import GtEvalConfig, run_gt_eval
from pipeline_service.types import SceneObservation


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
    def __init__(self, pairs):
        self._pairs = pairs

    def __iter__(self):
        return iter(self._pairs)


def _exact_matcher(a, b):
    return a.strip().lower() == b.strip().lower()


def _make_obs(scene_id, dets):
    obs = SceneObservation.empty(scene_id=scene_id, run_id="r", frame_ids=["f"])
    return obs.model_copy(update={"detections": dets})


@pytest.fixture(scope="module")
def eval_fixtures_dir():
    return Path(__file__).resolve().parent.parent / "replay" / "fixtures" / "eval"


def test_gt_eval_e2e_against_fixture_corpus(eval_fixtures_dir):
    image_dir = eval_fixtures_dir / "images"
    images = sorted(image_dir.glob("*.jpg"))[:5]
    assert len(images) == 5, "expected 5 fixture images"

    gt_per_image = {
        "couch": [_GT(0, 0, 200, 200, 1, "couch")],
        "lamp": [_GT(0, 0, 100, 100, 2, "lamp")],
        "fridge": [_GT(0, 0, 150, 150, 3, "refrigerator")],
        "bookshelf": [_GT(0, 0, 200, 300, 4, "bookcase")],
        "dining_table": [_GT(0, 0, 250, 250, 5, "dining_table")],
    }
    pairs = [(p, gt_per_image[p.stem]) for p in images]

    label_for_image = {
        "couch": "couch",
        "lamp": "lamp",
        "fridge": "refrigerator",
        "bookshelf": "bookcase",
        "dining_table": "dining_table",
    }

    def runner(image_path):
        label = label_for_image[image_path.stem]
        return _make_obs(
            f"s-{image_path.stem}",
            [
                _Det(label, _BBox(0, 0, 200, 200)),
                _Det("orange", _BBox(300, 300, 5, 5)),
            ],
        )

    judge = MagicMock()
    judge.verify = AsyncMock(return_value="no")

    block = run_gt_eval(
        GtEvalConfig(judge=judge),
        _DS(pairs),
        runner,
        detection_health_check=lambda: None,
        label_matcher=_exact_matcher,
    )

    assert block.n_images == 5
    assert block.n_predictions == 10
    assert block.n_ground_truths == 5
    # The test expects a non-trivial rate: orange preds are always unmatched
    # (no GT named 'orange' anywhere), so >=5 of 10 predictions are
    # hallucination candidates and the judge says "no" to each.
    assert block.headline.hallucination_rate is not None
    assert block.headline.hallucination_rate >= 0.5
    assert block.per_class_top10
    assert all(c.ap >= 0.0 for c in block.per_class_top10)


def test_payload_contains_required_keys(eval_fixtures_dir, tmp_path):
    image_dir = eval_fixtures_dir / "images"
    images = sorted(image_dir.glob("*.jpg"))[:1]
    pairs = [(images[0], [_GT(0, 0, 200, 200, 1, "couch")])]

    def runner(image_path):
        return _make_obs("s", [_Det("couch", _BBox(0, 0, 200, 200))])

    block = run_gt_eval(
        GtEvalConfig(judge=None),
        _DS(pairs),
        runner,
        detection_health_check=lambda: None,
        label_matcher=_exact_matcher,
    )

    from pipeline_service.eval.run_eval import _gt_metrics_block_to_dict

    serialised = _gt_metrics_block_to_dict(block)
    expected_headline_keys = {
        "class_aware_map_50_95",
        "class_aware_map_50",
        "class_agnostic_map_50_95",
        "class_agnostic_map_50",
        "label_f1",
        "box_f1_50",
        "hallucination_rate",
        "novel_likely_correct",
        "judge_unsure",
    }
    assert expected_headline_keys.issubset(set(serialised["headline"].keys()))
    out_path = tmp_path / "gt.json"
    out_path.write_text(json.dumps(serialised))
    loaded = json.loads(out_path.read_text())
    assert loaded["headline"]["class_aware_map_50_95"] == serialised["headline"]["class_aware_map_50_95"]
