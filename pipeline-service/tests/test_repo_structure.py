"""Asserts that section-01's directory layout from §2 of the plan exists.

This is the only test that "lives" at the tests/ root rather than under unit/
or integration/, because it's a structural assertion about the project itself.
"""
from __future__ import annotations

from pathlib import Path

import pytest

PIPELINE_ROOT = Path(__file__).resolve().parent.parent


@pytest.mark.parametrize(
    "rel_path",
    [
        "pyproject.toml",
        "uv.lock",
        "pipeline_service/__init__.py",
        "pipeline_service/dagster_defs.py",
        "pipeline_service/types.py",
        "pipeline_service/config.py",
        "pipeline_service/log_redaction.py",
        "pipeline_service/api/__init__.py",
        "pipeline_service/api/server.py",
        "pipeline_service/api/schemas.py",
        # ops
        "pipeline_service/ops/__init__.py",
        "pipeline_service/ops/frame_intake.py",
        "pipeline_service/ops/scene_embedding.py",
        "pipeline_service/ops/vlm_prompt_expansion.py",
        "pipeline_service/ops/florence_detect.py",
        "pipeline_service/ops/grounding_dino_detect.py",
        "pipeline_service/ops/sahi_recovery.py",
        "pipeline_service/ops/effsam_segment.py",
        "pipeline_service/ops/box_fusion.py",
        "pipeline_service/ops/crop_embedding.py",
        "pipeline_service/ops/cross_pass_dedup.py",
        "pipeline_service/ops/cross_frame_dedup.py",
        "pipeline_service/ops/classification_refine.py",
        "pipeline_service/ops/agreement_scoring.py",
        "pipeline_service/ops/self_diagnosis.py",
        "pipeline_service/ops/assemble_result.py",
        # models
        "pipeline_service/models/__init__.py",
        "pipeline_service/models/florence_client.py",
        "pipeline_service/models/ollama_client.py",
        "pipeline_service/models/grounding_dino.py",
        "pipeline_service/models/effsam.py",
        "pipeline_service/models/dinov2.py",
        "pipeline_service/models/label_encoder.py",
        # storage
        "pipeline_service/storage/__init__.py",
        "pipeline_service/storage/faiss_index.py",
        "pipeline_service/storage/prompt_cache.py",
        "pipeline_service/storage/retention.py",
        # eval
        "eval/run_eval.py",
        "eval/metrics.py",
        "eval/thresholds.json",
        # tests/replay
        "tests/replay/README.md",
        "tests/replay/test_op_replay.py",
    ],
)
def test_required_path_exists(rel_path: str) -> None:
    assert (PIPELINE_ROOT / rel_path).exists(), (
        f"required path missing: {rel_path}"
    )


def test_eval_corpora_dir_exists_and_is_gitignored() -> None:
    corpora = PIPELINE_ROOT / "eval" / "corpora"
    assert corpora.is_dir()
    gitignore = PIPELINE_ROOT / ".gitignore"
    assert gitignore.exists()
    assert "eval/corpora/" in gitignore.read_text()


def test_start_pipeline_script_exists_and_is_executable() -> None:
    repo_root = PIPELINE_ROOT.parent
    script = repo_root / "scripts" / "start-pipeline.sh"
    assert script.exists(), "scripts/start-pipeline.sh must exist at repo root"
    assert script.stat().st_mode & 0o111, "start-pipeline.sh must be executable"
