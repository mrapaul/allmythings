"""Tests for thresholds.json file management in run_eval."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from pipeline_service.eval.run_eval import (
    _DEFAULT_THRESHOLDS_PAYLOAD,
    _ensure_thresholds_file,
)


def test_missing_thresholds_creates_file_with_defaults(tmp_path: Path) -> None:
    target = tmp_path / "thresholds.json"
    out = _ensure_thresholds_file(target)
    assert target.exists()
    payload = json.loads(target.read_text())
    assert payload == _DEFAULT_THRESHOLDS_PAYLOAD
    assert out == payload


def test_existing_thresholds_preserved_verbatim_when_keys_present(
    tmp_path: Path,
) -> None:
    target = tmp_path / "thresholds.json"
    pre_existing = {
        "gating": {
            "agreement_coverage_min": 0.99,  # custom value, must NOT change
            "dedup_precision_min": 0.88,
            "op_failure_rate_max": 0.05,
            "class_aware_map_50_95_min": 0.20,
            "class_agnostic_map_50_95_min": 0.30,
            "label_f1_min": 0.50,
            "hallucination_rate_max": 0.15,
        },
        "warn": _DEFAULT_THRESHOLDS_PAYLOAD["warn"],
    }
    target.write_text(json.dumps(pre_existing))
    out = _ensure_thresholds_file(target)
    assert out["gating"]["agreement_coverage_min"] == 0.99


def test_existing_thresholds_extended_with_missing_new_keys(tmp_path: Path) -> None:
    """Pre-existing file with only the legacy keys gets the new keys added."""
    target = tmp_path / "thresholds.json"
    legacy = {
        "gating": {
            "agreement_coverage_min": 0.70,
            "dedup_precision_min": 0.88,
            "op_failure_rate_max": 0.05,
        },
        "warn": {
            "agreement_precision_min": 0.40,
            "self_diagnosis_trigger_rate_max": 0.30,
            "single_source_run_rate_max": 0.05,
            "empty_detection_set_rate_max": 0.02,
        },
    }
    target.write_text(json.dumps(legacy))
    out = _ensure_thresholds_file(target)
    # Existing keys preserved verbatim.
    assert out["gating"]["agreement_coverage_min"] == 0.70
    # New keys added.
    assert out["gating"]["class_aware_map_50_95_min"] == 0.20
    assert out["warn"]["box_f1_50_min"] == 0.45
    # File on disk reflects the merge.
    on_disk = json.loads(target.read_text())
    assert on_disk == out


def test_malformed_thresholds_re_raises(tmp_path: Path) -> None:
    target = tmp_path / "thresholds.json"
    target.write_text("{not json")
    with pytest.raises(json.JSONDecodeError):
        _ensure_thresholds_file(target)
