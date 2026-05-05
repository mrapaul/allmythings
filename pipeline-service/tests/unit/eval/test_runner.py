"""Tests for ``single_image_pipeline_runner``.

All tests mock ``pipeline_job.execute_in_process`` so no real Dagster
execution happens. The fixture image lives at
``tests/replay/fixtures/eval/images/<one>.jpg`` (provided by §01).
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from pipeline_service.eval.gt_eval.runner import single_image_pipeline_runner
from pipeline_service.types import SceneObservation


@pytest.fixture(autouse=True)
def _isolate_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("EVAL_SKIP_SAHI", raising=False)
    monkeypatch.delenv("CLASSIFICATION_TOP_K", raising=False)


@pytest.fixture
def fixture_image(eval_fixtures_dir: Path) -> Path:
    p = eval_fixtures_dir / "images" / "couch.jpg"
    assert p.exists(), f"missing fixture image: {p}"
    return p


def _fake_obs() -> SceneObservation:
    return SceneObservation.empty(
        scene_id="lvis-couch",
        run_id="test-run-id",
        frame_ids=["lvis-couch/0/couch"],
    )


def _fake_execute_result(obs: SceneObservation) -> MagicMock:
    res = MagicMock()
    res.success = True
    res.output_for_node.return_value = obs.model_dump(by_alias=True)
    return res


def test_runner_is_a_top_level_function() -> None:
    """Required for unit-test patchability."""
    import pipeline_service.eval.gt_eval.runner as runner_mod

    assert runner_mod.single_image_pipeline_runner is single_image_pipeline_runner
    assert callable(single_image_pipeline_runner)
    assert getattr(single_image_pipeline_runner, "__module__", None) == (
        "pipeline_service.eval.gt_eval.runner"
    )


def test_run_config_has_one_frame_with_required_keys(
    fixture_image: Path,
) -> None:
    captured: dict = {}

    def _capture(**kwargs):
        captured.update(kwargs)
        return _fake_execute_result(_fake_obs())

    fake_job = MagicMock()
    fake_job.execute_in_process = MagicMock(side_effect=_capture)
    with patch.dict(
        "sys.modules",
        {"pipeline_service.dagster_defs": MagicMock(pipeline_job=fake_job)},
    ):
        result = single_image_pipeline_runner(fixture_image)

    assert isinstance(result, SceneObservation)
    cfg = captured["run_config"]
    frames = cfg["ops"]["frame_intake"]["config"]["frames"]
    assert len(frames) == 1
    f = frames[0]
    assert set(f.keys()) >= {
        "frame_id",
        "sha256",
        "mime_type",
        "photo_bytes_hex",
    }
    raw = fixture_image.read_bytes()
    assert f["sha256"] == hashlib.sha256(raw).hexdigest()
    assert f["frame_id"].startswith(f"lvis-{fixture_image.stem}")
    assert f["mime_type"] == "image/jpeg"


def test_apply_eval_skip_sahi_sets_env_then_unsets(
    fixture_image: Path,
) -> None:
    seen_during_call: dict = {}

    def _capture(**kwargs):
        seen_during_call["EVAL_SKIP_SAHI"] = os.environ.get("EVAL_SKIP_SAHI")
        return _fake_execute_result(_fake_obs())

    fake_job = MagicMock()
    fake_job.execute_in_process = MagicMock(side_effect=_capture)
    with patch.dict(
        "sys.modules",
        {"pipeline_service.dagster_defs": MagicMock(pipeline_job=fake_job)},
    ):
        single_image_pipeline_runner(fixture_image, apply_eval_skip_sahi=True)

    assert seen_during_call["EVAL_SKIP_SAHI"] == "1"
    assert "EVAL_SKIP_SAHI" not in os.environ


def test_apply_eval_top_k_sets_classification_top_k(
    fixture_image: Path,
) -> None:
    seen_during_call: dict = {}

    def _capture(**kwargs):
        seen_during_call["CLASSIFICATION_TOP_K"] = os.environ.get("CLASSIFICATION_TOP_K")
        return _fake_execute_result(_fake_obs())

    fake_job = MagicMock()
    fake_job.execute_in_process = MagicMock(side_effect=_capture)
    with patch.dict(
        "sys.modules",
        {"pipeline_service.dagster_defs": MagicMock(pipeline_job=fake_job)},
    ):
        single_image_pipeline_runner(fixture_image, apply_eval_top_k=3)

    assert seen_during_call["CLASSIFICATION_TOP_K"] == "3"
    assert "CLASSIFICATION_TOP_K" not in os.environ


def test_returns_scene_observation_from_assemble_result(
    fixture_image: Path,
) -> None:
    obs = _fake_obs()
    fake_result = _fake_execute_result(obs)
    fake_job = MagicMock()
    fake_job.execute_in_process = MagicMock(return_value=fake_result)
    with patch.dict(
        "sys.modules",
        {"pipeline_service.dagster_defs": MagicMock(pipeline_job=fake_job)},
    ):
        result = single_image_pipeline_runner(fixture_image)
    assert isinstance(result, SceneObservation)
    assert result.sceneId == obs.sceneId


def test_pipeline_op_failure_surfaces_as_flagged_not_raised(
    fixture_image: Path,
) -> None:
    fake_job = MagicMock()
    fake_job.execute_in_process = MagicMock(
        side_effect=RuntimeError("boom — simulated op failure")
    )
    with patch.dict(
        "sys.modules",
        {"pipeline_service.dagster_defs": MagicMock(pipeline_job=fake_job)},
    ):
        result = single_image_pipeline_runner(fixture_image)
    assert isinstance(result, SceneObservation)
    assert result.flagged is True
    assert result.errors, "expected errors to be populated"
    assert any("boom" in e.message for e in result.errors)


def test_default_skip_sahi_false_does_not_touch_env(
    fixture_image: Path,
) -> None:
    seen: dict = {}

    def _capture(**kwargs):
        seen["EVAL_SKIP_SAHI"] = os.environ.get("EVAL_SKIP_SAHI")
        seen["CLASSIFICATION_TOP_K"] = os.environ.get("CLASSIFICATION_TOP_K")
        return _fake_execute_result(_fake_obs())

    fake_job = MagicMock()
    fake_job.execute_in_process = MagicMock(side_effect=_capture)
    with patch.dict(
        "sys.modules",
        {"pipeline_service.dagster_defs": MagicMock(pipeline_job=fake_job)},
    ):
        single_image_pipeline_runner(fixture_image)
    assert seen["EVAL_SKIP_SAHI"] is None
    assert seen["CLASSIFICATION_TOP_K"] is None
    assert "EVAL_SKIP_SAHI" not in os.environ
    assert "CLASSIFICATION_TOP_K" not in os.environ


def test_dagster_run_failure_returns_flagged(fixture_image: Path) -> None:
    """``execute_result.success=False`` → flagged observation."""
    fake_result = MagicMock()
    fake_result.success = False
    fake_result.output_for_node.side_effect = RuntimeError("should not be called")
    fake_job = MagicMock()
    fake_job.execute_in_process = MagicMock(return_value=fake_result)
    with patch.dict(
        "sys.modules",
        {"pipeline_service.dagster_defs": MagicMock(pipeline_job=fake_job)},
    ):
        result = single_image_pipeline_runner(fixture_image)
    assert isinstance(result, SceneObservation)
    assert result.flagged is True
