"""Tests for ``gt_eval.baseline`` — diff_and_check + maybe_commit_baseline."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from pipeline_service.eval.gt_eval.baseline import (
    BaselineDiff,
    CategoryAP,
    GtMetricsBlock,
    HeadlineMetrics,
    Stamps,
    diff_and_check,
    maybe_commit_baseline,
)


def _stamps(
    sha: str = "abc123",
    encoder: str = "sentence-transformers/all-MiniLM-L6-v2",
    py: str = "3.11.10",
    when: str = "2026-05-05T13:24:00Z",
) -> Stamps:
    return Stamps(
        lvis_dataset_sha256=sha,
        label_encoder_model_id=encoder,
        python_version=py,
        created_at=when,
    )


def _headline(
    *,
    class_aware_map_50_95: float = 0.30,
    class_aware_map_50: float = 0.45,
    class_agnostic_map_50_95: float = 0.40,
    class_agnostic_map_50: float = 0.55,
    label_f1: float = 0.55,
    box_f1_50: float = 0.50,
    hallucination_rate=0.10,
    novel_likely_correct: int = 5,
    judge_unsure: int = 3,
) -> HeadlineMetrics:
    return HeadlineMetrics(
        class_aware_map_50_95=class_aware_map_50_95,
        class_aware_map_50=class_aware_map_50,
        class_agnostic_map_50_95=class_agnostic_map_50_95,
        class_agnostic_map_50=class_agnostic_map_50,
        label_f1=label_f1,
        box_f1_50=box_f1_50,
        hallucination_rate=hallucination_rate,
        novel_likely_correct=novel_likely_correct,
        judge_unsure=judge_unsure,
    )


def _block(
    headline: HeadlineMetrics | None = None,
    *,
    runtime_s: float = 100.0,
    n_images: int = 500,
) -> GtMetricsBlock:
    return GtMetricsBlock(
        headline=headline or _headline(),
        per_class_top10=[CategoryAP("couch", 0.71)],
        per_class_bottom10=[CategoryAP("spice_rack", 0.04)],
        n_images=n_images,
        n_predictions=4321,
        n_ground_truths=5012,
        runtime_s=runtime_s,
    )


def _write_thresholds(path: Path) -> None:
    path.write_text(
        json.dumps(
            {
                "gating": {
                    "class_aware_map_50_95_min": 0.20,
                    "class_agnostic_map_50_95_min": 0.30,
                    "label_f1_min": 0.50,
                    "hallucination_rate_max": 0.15,
                }
            }
        )
    )


# ---------- Round-trip ------------------------------------------------------


def test_round_trip_io(tmp_path: Path) -> None:
    """Commit then re-load; gt_metrics + stamps survive."""
    baseline = tmp_path / "baseline.json"
    thresholds = tmp_path / "thresholds.json"
    _write_thresholds(thresholds)
    stamps = _stamps()
    block = _block()

    diff = diff_and_check(
        block,
        baseline,
        thresholds,
        current_stamps=stamps,
    )
    assert diff.floor_violations == []

    written = maybe_commit_baseline(
        diff, block, baseline, autocommit_enabled=True, current_stamps=stamps
    )
    assert written is True
    assert baseline.exists()

    payload = json.loads(baseline.read_text())
    assert "gt_metrics" in payload
    assert "stamps" in payload
    assert payload["stamps"]["lvis_dataset_sha256"] == "abc123"
    # rounding to 3 decimals on disk
    assert payload["gt_metrics"]["headline"]["class_aware_map_50_95"] == 0.3


def test_diff_correctness_regressions_and_improvements(tmp_path: Path) -> None:
    baseline = tmp_path / "baseline.json"
    thresholds = tmp_path / "thresholds.json"
    _write_thresholds(thresholds)
    stamps = _stamps()
    base_block = _block(
        headline=_headline(
            class_aware_map_50_95=0.30, label_f1=0.55, hallucination_rate=0.10
        )
    )
    maybe_commit_baseline(
        BaselineDiff(),
        base_block,
        baseline,
        autocommit_enabled=True,
        current_stamps=stamps,
    )

    current = _block(
        headline=_headline(
            class_aware_map_50_95=0.25,  # regression -0.05
            label_f1=0.60,               # improvement +0.05
            hallucination_rate=0.08,     # improvement (lower-is-better, -0.02)
        )
    )
    diff = diff_and_check(
        current,
        baseline,
        thresholds,
        current_stamps=stamps,
        now=datetime(2026, 5, 6, tzinfo=timezone.utc),
    )
    reg_keys = {r.metric for r in diff.regressions}
    imp_keys = {i.metric for i in diff.improvements}
    assert "class_aware_map_50_95" in reg_keys
    assert "label_f1" in imp_keys
    assert "hallucination_rate" in imp_keys


def test_floor_enforcement_blocks_commit_even_when_autocommit_on(
    tmp_path: Path,
) -> None:
    baseline = tmp_path / "baseline.json"
    thresholds = tmp_path / "thresholds.json"
    _write_thresholds(thresholds)
    stamps = _stamps()

    bad = _block(headline=_headline(class_aware_map_50_95=0.18))  # below 0.20
    diff = diff_and_check(bad, baseline, thresholds, current_stamps=stamps)
    assert any(v.metric == "class_aware_map_50_95" for v in diff.floor_violations)

    written = maybe_commit_baseline(
        diff, bad, baseline, autocommit_enabled=True, current_stamps=stamps
    )
    assert written is False
    assert not baseline.exists()


def test_bootstrap_respects_floors(tmp_path: Path) -> None:
    baseline = tmp_path / "baseline.json"
    thresholds = tmp_path / "thresholds.json"
    _write_thresholds(thresholds)
    stamps = _stamps()
    bad = _block(headline=_headline(label_f1=0.40))
    diff = diff_and_check(bad, baseline, thresholds, current_stamps=stamps)
    assert diff.floor_violations
    written = maybe_commit_baseline(
        diff, bad, baseline, autocommit_enabled=True, current_stamps=stamps
    )
    assert written is False
    assert not baseline.exists()


def test_version_mismatch_detection(tmp_path: Path) -> None:
    baseline = tmp_path / "baseline.json"
    thresholds = tmp_path / "thresholds.json"
    _write_thresholds(thresholds)

    # Pre-write a baseline with known stamps.
    base_block = _block()
    maybe_commit_baseline(
        BaselineDiff(),
        base_block,
        baseline,
        autocommit_enabled=True,
        current_stamps=_stamps(sha="aaa"),
    )

    # Now check with a mismatched current_stamps.
    diff = diff_and_check(
        _block(),
        baseline,
        thresholds,
        current_stamps=_stamps(sha="bbb"),
    )
    assert diff.version_mismatch is True
    assert diff.regressions == []
    assert diff.improvements == []
    assert diff.baseline_age_days == 0


def test_label_encoder_mismatch_detection(tmp_path: Path) -> None:
    baseline = tmp_path / "baseline.json"
    thresholds = tmp_path / "thresholds.json"
    _write_thresholds(thresholds)
    maybe_commit_baseline(
        BaselineDiff(),
        _block(),
        baseline,
        autocommit_enabled=True,
        current_stamps=_stamps(encoder="enc-A"),
    )
    diff = diff_and_check(
        _block(),
        baseline,
        thresholds,
        current_stamps=_stamps(encoder="enc-B"),
    )
    assert diff.version_mismatch is True


def test_python_version_mismatch_detection(tmp_path: Path) -> None:
    baseline = tmp_path / "baseline.json"
    thresholds = tmp_path / "thresholds.json"
    _write_thresholds(thresholds)
    maybe_commit_baseline(
        BaselineDiff(),
        _block(),
        baseline,
        autocommit_enabled=True,
        current_stamps=_stamps(py="3.11.10"),
    )
    diff = diff_and_check(
        _block(),
        baseline,
        thresholds,
        current_stamps=_stamps(py="3.12.0"),
    )
    assert diff.version_mismatch is True


def test_rounding_to_three_decimals_before_persistence(tmp_path: Path) -> None:
    baseline = tmp_path / "baseline.json"
    thresholds = tmp_path / "thresholds.json"
    _write_thresholds(thresholds)
    stamps = _stamps()
    block = _block(
        headline=_headline(class_aware_map_50_95=0.247912, label_f1=0.612500)
    )
    diff = diff_and_check(block, baseline, thresholds, current_stamps=stamps)
    maybe_commit_baseline(
        diff, block, baseline, autocommit_enabled=True, current_stamps=stamps
    )
    payload = json.loads(baseline.read_text())
    assert payload["gt_metrics"]["headline"]["class_aware_map_50_95"] == 0.248
    assert payload["gt_metrics"]["n_images"] == 500  # cardinal not rounded


def test_runtime_s_is_rounded(tmp_path: Path) -> None:
    baseline = tmp_path / "baseline.json"
    thresholds = tmp_path / "thresholds.json"
    _write_thresholds(thresholds)
    stamps = _stamps()
    block = _block(runtime_s=1842.3456)
    maybe_commit_baseline(
        BaselineDiff(),
        block,
        baseline,
        autocommit_enabled=True,
        current_stamps=stamps,
    )
    payload = json.loads(baseline.read_text())
    assert payload["gt_metrics"]["runtime_s"] == 1842.346


def test_malformed_baseline_json_treated_as_missing(
    tmp_path: Path, caplog
) -> None:
    baseline = tmp_path / "baseline.json"
    thresholds = tmp_path / "thresholds.json"
    _write_thresholds(thresholds)
    baseline.write_text("{not json")
    stamps = _stamps()
    diff = diff_and_check(_block(), baseline, thresholds, current_stamps=stamps)
    assert diff.regressions == []
    assert diff.improvements == []
    assert diff.version_mismatch is False
    # original malformed file still on disk (not rewritten by diff_and_check)
    assert baseline.read_text() == "{not json"


def test_autocommit_false_returns_false_on_perfect_run(tmp_path: Path) -> None:
    baseline = tmp_path / "baseline.json"
    thresholds = tmp_path / "thresholds.json"
    _write_thresholds(thresholds)
    stamps = _stamps()
    block = _block()
    diff = diff_and_check(block, baseline, thresholds, current_stamps=stamps)
    written = maybe_commit_baseline(
        diff, block, baseline, autocommit_enabled=False, current_stamps=stamps
    )
    assert written is False
    assert not baseline.exists()


def test_baseline_missing_gt_metrics_block_treated_as_bootstrap(
    tmp_path: Path,
) -> None:
    baseline = tmp_path / "baseline.json"
    thresholds = tmp_path / "thresholds.json"
    _write_thresholds(thresholds)
    # Pre-write a baseline with existing top-level keys but no gt_metrics.
    baseline.write_text(json.dumps({"metrics": {"existing": True}}))
    stamps = _stamps()

    diff = diff_and_check(_block(), baseline, thresholds, current_stamps=stamps)
    assert diff.regressions == []
    assert diff.improvements == []
    assert diff.version_mismatch is False

    written = maybe_commit_baseline(
        diff,
        _block(),
        baseline,
        autocommit_enabled=True,
        current_stamps=stamps,
    )
    assert written is True
    payload = json.loads(baseline.read_text())
    assert payload["metrics"] == {"existing": True}  # preserved verbatim
    assert "gt_metrics" in payload
    assert "stamps" in payload


def test_baseline_age_days_computed_from_stamps_created_at(tmp_path: Path) -> None:
    baseline = tmp_path / "baseline.json"
    thresholds = tmp_path / "thresholds.json"
    _write_thresholds(thresholds)
    maybe_commit_baseline(
        BaselineDiff(),
        _block(),
        baseline,
        autocommit_enabled=True,
        current_stamps=_stamps(when="2026-05-05T13:24:00Z"),
    )

    diff = diff_and_check(
        _block(),
        baseline,
        thresholds,
        current_stamps=_stamps(when="2026-05-05T13:24:00Z"),
        now=datetime(2026, 5, 15, 13, 24, 0, tzinfo=timezone.utc),
    )
    assert diff.baseline_age_days == 10


def test_hallucination_rate_null_skips_its_floor(tmp_path: Path) -> None:
    baseline = tmp_path / "baseline.json"
    thresholds = tmp_path / "thresholds.json"
    _write_thresholds(thresholds)
    stamps = _stamps()
    block = _block(headline=_headline(hallucination_rate=None))
    diff = diff_and_check(block, baseline, thresholds, current_stamps=stamps)
    assert all(v.metric != "hallucination_rate" for v in diff.floor_violations)


def test_existing_top_level_keys_preserved_on_commit(tmp_path: Path) -> None:
    baseline = tmp_path / "baseline.json"
    thresholds = tmp_path / "thresholds.json"
    _write_thresholds(thresholds)
    baseline.write_text(
        json.dumps(
            {
                "metrics": {"agreement_coverage": 0.81},
                "gt_metrics": {"headline": {}},
                "stamps": {
                    "lvis_dataset_sha256": "abc123",
                    "label_encoder_model_id": "sentence-transformers/all-MiniLM-L6-v2",
                    "python_version": "3.11.10",
                    "created_at": "2026-05-05T13:24:00Z",
                },
            }
        )
    )
    stamps = _stamps()
    diff = diff_and_check(_block(), baseline, thresholds, current_stamps=stamps)
    maybe_commit_baseline(
        diff,
        _block(),
        baseline,
        autocommit_enabled=True,
        current_stamps=stamps,
    )
    payload = json.loads(baseline.read_text())
    assert payload["metrics"] == {"agreement_coverage": 0.81}
