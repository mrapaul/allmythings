"""Integration of GT-eval block into ``run_eval.run`` payload.

Verifies that the optional ``gt_metrics_block`` and ``gt_diff`` kwargs
fold into the final ``last-metrics.json`` payload with the right
gating/exit-code semantics.
"""
from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

import pytest

from pipeline_service.eval.gt_eval.baseline import (
    BaselineDiff,
    CategoryAP,
    GtMetricsBlock,
    HeadlineMetrics,
    MetricDelta,
    MetricFloor,
)
from pipeline_service.eval.run_eval import _DEFAULT_THRESHOLDS_PAYLOAD, run


def _write_thresholds(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(_DEFAULT_THRESHOLDS_PAYLOAD, indent=2))


def _good_block() -> GtMetricsBlock:
    return GtMetricsBlock(
        headline=HeadlineMetrics(
            class_aware_map_50_95=0.30,
            class_aware_map_50=0.45,
            class_agnostic_map_50_95=0.40,
            class_agnostic_map_50=0.55,
            label_f1=0.60,
            box_f1_50=0.55,
            hallucination_rate=0.05,
            novel_likely_correct=2,
            judge_unsure=1,
        ),
        per_class_top10=[CategoryAP("couch", 0.7)],
        per_class_bottom10=[CategoryAP("spice_rack", 0.04)],
        n_images=5,
        n_predictions=12,
        n_ground_truths=11,
        runtime_s=1.0,
    )


def _bad_block() -> GtMetricsBlock:
    return GtMetricsBlock(
        headline=HeadlineMetrics(
            class_aware_map_50_95=0.05,  # below floor 0.20
            class_aware_map_50=0.10,
            class_agnostic_map_50_95=0.10,
            class_agnostic_map_50=0.20,
            label_f1=0.20,  # below floor 0.50
            box_f1_50=0.20,
            hallucination_rate=0.30,  # above floor 0.15
            novel_likely_correct=0,
            judge_unsure=0,
        ),
        per_class_top10=[],
        per_class_bottom10=[],
        n_images=5,
        n_predictions=10,
        n_ground_truths=10,
        runtime_s=1.0,
    )


def test_gt_metrics_block_lands_in_payload(tmp_path: Path) -> None:
    thresholds = tmp_path / "thresholds.json"
    output = tmp_path / "last-metrics.json"
    _write_thresholds(thresholds)

    code, payload = run(
        observations=[],
        pairs=[],
        corpora_dir=tmp_path / "corpora",
        thresholds_path=thresholds,
        output_path=output,
        gating=False,
        gt_metrics_block=_good_block(),
    )
    assert "gt_metrics" in payload
    assert payload["gt_metrics"]["headline"]["class_aware_map_50_95"] == 0.30
    assert code == 0


def test_gt_floor_violation_triggers_exit_1(tmp_path: Path) -> None:
    thresholds = tmp_path / "thresholds.json"
    output = tmp_path / "last-metrics.json"
    _write_thresholds(thresholds)

    code, payload = run(
        observations=[],
        pairs=[],
        corpora_dir=tmp_path / "corpora",
        thresholds_path=thresholds,
        output_path=output,
        gating=False,
        gt_metrics_block=_bad_block(),
    )
    assert code == 1
    # The violations list should mention the gt_-prefixed floor failures.
    assert any(v.startswith("gt_") for v in payload["violations"])


def test_gt_regression_triggers_exit_1_when_no_version_mismatch(
    tmp_path: Path,
) -> None:
    thresholds = tmp_path / "thresholds.json"
    output = tmp_path / "last-metrics.json"
    _write_thresholds(thresholds)
    diff = BaselineDiff(
        regressions=[
            MetricDelta(
                metric="class_aware_map_50_95",
                current=0.18,
                baseline=0.27,
                delta=-0.09,
            )
        ],
        improvements=[],
        floor_violations=[],
        version_mismatch=False,
    )
    code, payload = run(
        observations=[],
        pairs=[],
        corpora_dir=tmp_path / "corpora",
        thresholds_path=thresholds,
        output_path=output,
        gating=False,
        gt_metrics_block=_good_block(),
        gt_diff=diff,
    )
    assert code == 1
    assert "gt_diff" in payload


def test_version_mismatch_alone_keeps_exit_0(tmp_path: Path) -> None:
    thresholds = tmp_path / "thresholds.json"
    output = tmp_path / "last-metrics.json"
    _write_thresholds(thresholds)
    diff = BaselineDiff(
        regressions=[],
        improvements=[],
        floor_violations=[],
        version_mismatch=True,
    )
    code, payload = run(
        observations=[],
        pairs=[],
        corpora_dir=tmp_path / "corpora",
        thresholds_path=thresholds,
        output_path=output,
        gating=False,
        gt_metrics_block=_good_block(),
        gt_diff=diff,
    )
    assert code == 0
    assert payload["gt_diff"]["version_mismatch"] is True


def test_payload_contains_both_metrics_and_gt_metrics(tmp_path: Path) -> None:
    """``metrics`` and ``gt_metrics`` coexist in last-metrics.json."""
    thresholds = tmp_path / "thresholds.json"
    output = tmp_path / "last-metrics.json"
    _write_thresholds(thresholds)
    code, payload = run(
        observations=[],
        pairs=[],
        corpora_dir=tmp_path / "corpora",
        thresholds_path=thresholds,
        output_path=output,
        gating=False,
        gt_metrics_block=_good_block(),
    )
    assert "metrics" in payload
    assert "gt_metrics" in payload
    on_disk = json.loads(output.read_text())
    assert "metrics" in on_disk
    assert "gt_metrics" in on_disk
