"""§7 eval-rig integration tests."""
from __future__ import annotations

import json
from pathlib import Path

from pipeline_service.eval.run_eval import run
from pipeline_service.types import OpError, SceneObservation


def _obs(**kw) -> SceneObservation:
    return SceneObservation.empty(scene_id="s", run_id="r", frame_ids=[]).model_copy(
        update=kw
    )


def test_run_writes_last_metrics_json(tmp_path: Path) -> None:
    out = tmp_path / "last-metrics.json"
    code, payload = run(
        observations=[_obs(agreementCoverage=0.9, agreementPrecision=0.5)],
        pairs=[],
        corpora_dir=tmp_path / "no-corpus",
        thresholds_path=tmp_path / "no-thresh.json",
        output_path=out,
    )
    assert out.exists()
    written = json.loads(out.read_text())
    assert "metrics" in written
    assert written["metrics"]["agreement_coverage_avg"] == 0.9


def test_corpus_empty_informational_mode_no_gate(tmp_path: Path) -> None:
    code, payload = run(
        corpora_dir=tmp_path / "no-corpus",  # missing → empty
        thresholds_path=tmp_path / "no-thresh.json",
        output_path=tmp_path / "out.json",
    )
    assert payload["corpus_empty"] is True
    assert payload["gating"] is False
    assert code == 0  # informational mode never fails


def test_gating_violation_returns_nonzero(tmp_path: Path) -> None:
    thresholds = tmp_path / "thresh.json"
    thresholds.write_text(
        json.dumps(
            {
                "agreement_coverage_min": 0.70,
                "dedup_precision_min": 0.40,
                "op_failure_rate_max": 0.05,
                "single_source_run_rate_max": 0.05,
                "empty_detection_set_rate_max": 0.02,
            }
        )
    )
    # Below-threshold coverage → gate violation.
    code, payload = run(
        observations=[_obs(agreementCoverage=0.30, agreementPrecision=0.5)],
        pairs=[],
        corpora_dir=tmp_path / "no-corpus",
        thresholds_path=thresholds,
        output_path=tmp_path / "out.json",
        gating=True,
    )
    assert code != 0
    assert payload["ok"] is False
    assert any("agreement_coverage_avg" in v for v in payload["violations"])


def test_op_failure_rate_gate(tmp_path: Path) -> None:
    thresholds = tmp_path / "thresh.json"
    thresholds.write_text(
        json.dumps({"op_failure_rate_max": 0.05})
    )
    obs = [
        _obs(errors=[OpError(op="x", code="y", message="z")]),
        _obs(),
    ]
    # 50% failure rate vs 0.05 threshold → fails.
    code, payload = run(
        observations=obs,
        pairs=[],
        corpora_dir=tmp_path / "no-corpus",
        thresholds_path=thresholds,
        output_path=tmp_path / "out.json",
        gating=True,
    )
    assert code != 0


def test_metrics_are_computed_when_pairs_supplied(tmp_path: Path) -> None:
    a = _obs()
    b = _obs()
    code, payload = run(
        observations=[a, b],
        pairs=[(a, b)],
        corpora_dir=tmp_path / "no-corpus",
        thresholds_path=tmp_path / "no-thresh.json",
        output_path=tmp_path / "out.json",
    )
    assert "multi_frame_stability_avg" in payload["metrics"]
    assert payload["metrics"]["n_pairs"] == 1
