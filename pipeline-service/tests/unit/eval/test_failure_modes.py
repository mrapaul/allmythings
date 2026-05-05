"""Failure-mode coverage for the GT-eval harness."""
from __future__ import annotations

import json
from pathlib import Path
from typing import NamedTuple

import pytest

from pipeline_service.eval.gt_eval.baseline import (
    GtMetricsBlock,
    HeadlineMetrics,
    Stamps,
    diff_and_check,
)
from pipeline_service.eval.gt_eval.datasets.lvis import (
    LvisArchiveSha256Mismatch,
    LvisConfig,
    LvisDataset,
    LvisDownloadError,
    _stream_download,
)
from pipeline_service.eval.gt_eval.run import (
    GtEvalConfig,
    PipelineFailureRateExceeded,
    PreflightFailed,
    run_gt_eval,
)
from pipeline_service.types import OpError, SceneObservation


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


def _make_obs(scene_id, dets):
    obs = SceneObservation.empty(scene_id=scene_id, run_id="r", frame_ids=["f"])
    return obs.model_copy(update={"detections": dets})


def _ok_health() -> None:
    return None


def test_lvis_download_failure_mentions_local_zip(monkeypatch, tmp_path) -> None:
    """``LvisDownloadError`` message must mention ``LVIS_LOCAL_ZIP``."""
    import requests

    class _FakeResp:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def raise_for_status(self):
            raise requests.ConnectionError("simulated")

        @property
        def headers(self):
            return {}

        def iter_content(self, chunk_size):
            return iter([])

    def _fake_get(*args, **kwargs):
        return _FakeResp()

    monkeypatch.setattr(requests, "get", _fake_get)

    with pytest.raises(LvisDownloadError) as exc_info:
        _stream_download("http://example.com/lvis.zip", tmp_path / "x.zip")
    assert "LVIS_LOCAL_ZIP" in str(exc_info.value)


def test_lvis_sha256_mismatch_mentions_version_bump(
    monkeypatch, tmp_path, eval_fixtures_dir
) -> None:
    """The error must name ``EVAL_LVIS_VERSION_BUMP`` for operators."""
    import shutil

    cache_root = tmp_path / "cache"
    cache_root.mkdir()
    target = cache_root / "lvis_v1_train.json.zip"
    shutil.copyfile(
        eval_fixtures_dir / "synthetic_lvis_archive.zip", target
    )
    monkeypatch.setenv("LVIS_LOCAL_ZIP", str(target))

    with pytest.raises(LvisArchiveSha256Mismatch) as exc_info:
        LvisDataset(
            LvisConfig(
                cache_root=cache_root,
                sample_size=3,
                seed=0,
                expected_archive_sha256="0" * 64,
            )
        )
    assert "EVAL_LVIS_VERSION_BUMP" in str(exc_info.value)


def test_pipeline_failure_rate_5pct_raises(tmp_path) -> None:
    paths = [tmp_path / f"img-{i}.jpg" for i in range(20)]
    for p in paths:
        p.write_bytes(b"\xff\xd8\xff\xe0fake")
    pairs = [(p, [_GT(0, 0, 10, 10, 1, "couch")]) for p in paths]

    def runner(image_path):
        return _make_obs(f"s-{image_path.stem}", []).model_copy(
            update={
                "flagged": True,
                "errors": [OpError(op="x", code="E", message="m")],
            }
        )

    with pytest.raises(PipelineFailureRateExceeded):
        run_gt_eval(
            GtEvalConfig(),
            _DS(pairs),
            runner,
            detection_health_check=_ok_health,
            label_matcher=lambda a, b: a == b,
        )


def test_detection_service_preflight_unhealthy_raises_preflight_failed() -> None:
    def bad_health():
        raise PreflightFailed("503 unhealthy")

    with pytest.raises(PreflightFailed):
        run_gt_eval(
            GtEvalConfig(),
            _DS([]),
            lambda p: _make_obs("x", []),
            detection_health_check=bad_health,
            label_matcher=lambda a, b: a == b,
        )


def test_malformed_baseline_treated_as_missing(tmp_path) -> None:
    baseline = tmp_path / "baseline.json"
    thresholds = tmp_path / "thresholds.json"
    thresholds.write_text(json.dumps({"gating": {}}))
    baseline.write_text("{ not json")
    stamps = Stamps(
        lvis_dataset_sha256="x",
        label_encoder_model_id="y",
        python_version="z",
        created_at="2026-05-05T00:00:00Z",
    )
    block = GtMetricsBlock(
        headline=HeadlineMetrics(
            class_aware_map_50_95=0.5,
            class_aware_map_50=0.6,
            class_agnostic_map_50_95=0.5,
            class_agnostic_map_50=0.6,
            label_f1=0.6,
            box_f1_50=0.5,
            hallucination_rate=0.05,
            novel_likely_correct=0,
            judge_unsure=0,
        )
    )
    diff = diff_and_check(block, baseline, thresholds, current_stamps=stamps)
    assert diff.regressions == []
    assert diff.improvements == []
    assert baseline.read_text() == "{ not json"
