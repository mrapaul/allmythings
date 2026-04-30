"""§7 thresholds.json schema sanity."""
from __future__ import annotations

import json
from pathlib import Path

THRESHOLDS = (
    Path(__file__).resolve().parent.parent.parent.parent
    / "eval"
    / "thresholds.json"
)


def test_thresholds_parses_as_json() -> None:
    json.loads(THRESHOLDS.read_text())


def test_thresholds_has_required_keys() -> None:
    data = json.loads(THRESHOLDS.read_text())
    required = {
        "agreement_coverage_min",
        "dedup_precision_min",
        "op_failure_rate_max",
        "single_source_run_rate_max",
        "empty_detection_set_rate_max",
        "self_diagnosis_trigger_rate_max",
    }
    missing = required - set(data.keys())
    assert not missing, f"thresholds.json missing keys: {missing}"


def test_threshold_values_in_unit_interval() -> None:
    data = json.loads(THRESHOLDS.read_text())
    for key, val in data.items():
        if "_min" in key or "_max" in key:
            assert 0.0 <= val <= 1.0, f"{key}={val} not in [0, 1]"


def test_section_06_documented_defaults_present() -> None:
    """The §6.3 / §9 defaults are recorded as the gating values."""
    data = json.loads(THRESHOLDS.read_text())
    assert data["agreement_coverage_min"] == 0.70
    assert data["op_failure_rate_max"] == 0.05
