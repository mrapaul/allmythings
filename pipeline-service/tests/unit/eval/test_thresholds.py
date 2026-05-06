"""§7 thresholds.json schema sanity (post-section-09 bucket shape)."""
from __future__ import annotations

import json
from pathlib import Path

THRESHOLDS = (
    Path(__file__).resolve().parent.parent.parent.parent
    / "eval"
    / "thresholds.json"
)


def _load() -> dict:
    return json.loads(THRESHOLDS.read_text())


def test_thresholds_parses_as_json() -> None:
    _load()


def test_top_level_buckets_present() -> None:
    data = _load()
    assert "gating" in data, "thresholds.json must have a 'gating' bucket"
    assert "warn" in data, "thresholds.json must have a 'warn' bucket"
    assert isinstance(data["gating"], dict)
    assert isinstance(data["warn"], dict)


def test_version_is_pinned() -> None:
    data = _load()
    assert data.get("version") == 1


def test_gating_required_keys() -> None:
    """The three CI-gating thresholds enumerated in plan §6.5 / §7."""
    data = _load()
    required = {
        "agreement_coverage_min",
        "dedup_precision_min",
        "op_failure_rate_max",
    }
    missing = required - set(data["gating"].keys())
    assert not missing, f"gating bucket missing keys: {missing}"


def test_warn_required_keys() -> None:
    """The §6.3 secondary metrics that emit warnings but don't fail CI."""
    data = _load()
    required = {
        "agreement_precision_min",
        "self_diagnosis_trigger_rate_max",
        "single_source_run_rate_max",
        "empty_detection_set_rate_max",
    }
    missing = required - set(data["warn"].keys())
    assert not missing, f"warn bucket missing keys: {missing}"


def test_threshold_values_in_unit_interval() -> None:
    data = _load()
    for bucket_name in ("gating", "warn"):
        for key, val in data[bucket_name].items():
            if key.endswith("_min") or key.endswith("_max"):
                assert 0.0 <= val <= 1.0, (
                    f"{bucket_name}.{key}={val} not in [0, 1]"
                )


def test_section_09_documented_defaults_present() -> None:
    """The §6.5 / §9 documented gates are honoured as the defaults."""
    data = _load()
    assert data["gating"]["agreement_coverage_min"] == 0.70
    assert data["gating"]["dedup_precision_min"] == 0.88
    assert data["gating"]["op_failure_rate_max"] == 0.05


def test_warn_documented_defaults_present() -> None:
    """The §6.5 secondary defaults."""
    data = _load()
    w = data["warn"]
    assert w["agreement_precision_min"] == 0.40
    assert w["self_diagnosis_trigger_rate_max"] == 0.30
    assert w["single_source_run_rate_max"] == 0.05
    assert w["empty_detection_set_rate_max"] == 0.02
