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


# ---------------------------------------------------------------------------
# Bucketed thresholds (gating vs warn) — section-09 §6.5 / §7
# ---------------------------------------------------------------------------


def test_warn_bucket_does_not_affect_exit_code(tmp_path: Path) -> None:
    """A warn-bucket violation must not flip the exit code; it must still be
    surfaced in the payload under 'warnings' so operators see it."""
    thresholds = tmp_path / "thresh.json"
    thresholds.write_text(
        json.dumps(
            {
                "version": 1,
                "gating": {
                    # Use a tolerant gating threshold so coverage doesn't fail.
                    "agreement_coverage_min": 0.0,
                },
                "warn": {
                    # We'll trip this one with low precision.
                    "agreement_precision_min": 0.80,
                },
            }
        )
    )
    code, payload = run(
        observations=[_obs(agreementCoverage=0.9, agreementPrecision=0.10)],
        pairs=[],
        corpora_dir=tmp_path / "no-corpus",
        thresholds_path=thresholds,
        output_path=tmp_path / "out.json",
        gating=True,
    )
    assert code == 0, "warn-only violations must keep exit code green"
    assert payload["ok"] is True
    assert any(
        "agreement_precision_avg" in w for w in payload.get("warnings", [])
    ), "warn violations must be recorded in payload['warnings']"
    assert payload["violations"] == []


def test_gating_bucket_violation_is_separate_from_warn(tmp_path: Path) -> None:
    """A gating-bucket violation must fail; a warn-bucket trip on the same run
    must coexist without being mistaken for a gating failure."""
    thresholds = tmp_path / "thresh.json"
    thresholds.write_text(
        json.dumps(
            {
                "version": 1,
                "gating": {
                    "agreement_coverage_min": 0.70,
                },
                "warn": {
                    "self_diagnosis_trigger_rate_max": 0.10,
                },
            }
        )
    )
    obs = [
        _obs(agreementCoverage=0.30, selfDiagnosisTriggered=True),
        _obs(agreementCoverage=0.30, selfDiagnosisTriggered=True),
    ]
    code, payload = run(
        observations=obs,
        pairs=[],
        corpora_dir=tmp_path / "no-corpus",
        thresholds_path=thresholds,
        output_path=tmp_path / "out.json",
        gating=True,
    )
    assert code != 0
    assert any("agreement_coverage_avg" in v for v in payload["violations"])
    # warn trip is also visible
    assert any(
        "self_diagnosis_trigger_rate" in w for w in payload.get("warnings", [])
    )


def test_canonical_thresholds_load_from_repo(tmp_path: Path) -> None:
    """The repo's pipeline-service/eval/thresholds.json must be a valid
    bucket-shaped config and produce sensible behaviour for an empty corpus."""
    code, payload = run(
        corpora_dir=tmp_path / "no-corpus",
        # default thresholds_path → repo's eval/thresholds.json
        output_path=tmp_path / "out.json",
    )
    assert code == 0  # empty corpus → informational mode
    assert "gating" in payload["thresholds"]
    assert "warn" in payload["thresholds"]


def test_legacy_flat_thresholds_still_work(tmp_path: Path) -> None:
    """Backwards compat: a flat thresholds.json (legacy) must be promoted into
    the gating bucket so older configs don't silently skip gating."""
    flat = tmp_path / "flat.json"
    flat.write_text(json.dumps({"agreement_coverage_min": 0.70}))
    code, payload = run(
        observations=[_obs(agreementCoverage=0.10)],
        pairs=[],
        corpora_dir=tmp_path / "no-corpus",
        thresholds_path=flat,
        output_path=tmp_path / "out.json",
        gating=True,
    )
    assert code != 0  # legacy flat threshold still trips the gate


# ---------------------------------------------------------------------------
# Corpus walker integration — populated corpus produces real observations
# ---------------------------------------------------------------------------


def _make_webp(path: Path, *, color=(80, 80, 80)) -> None:
    from PIL import Image
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (16, 12), color=color).save(path, format="WEBP")


def test_run_walks_populated_corpus_when_observations_unset(
    tmp_path: Path, monkeypatch
) -> None:
    """When corpus has scenes and the caller didn't pass observations,
    run() must walk the corpus and produce one observation per
    (scene, capture). Without this wiring a populated corpus produces
    zero observations and gating fails spuriously (the bug §6.5
    addressed)."""
    corpora = tmp_path / "corpora"
    for fi in range(3):
        _make_webp(corpora / "scene_X" / "capture-1" / f"frame-{fi}.webp")
        _make_webp(corpora / "scene_X" / "capture-2" / f"frame-{fi}.webp",
                   color=(180, 180, 180))

    # Inject a fake runner so we don't need Dagster + model HTTP backends.
    from pipeline_service.eval import corpus_walker as cw

    def fake_runner(item, payload):
        return _obs(agreementCoverage=0.95, agreementPrecision=0.90)

    monkeypatch.setattr(cw, "default_pipeline_runner", fake_runner)

    code, payload = run(
        corpora_dir=corpora,
        thresholds_path=tmp_path / "no-thresh.json",
        output_path=tmp_path / "out.json",
    )
    assert payload["metrics"]["n_observations"] == 2
    assert payload["metrics"]["n_pairs"] == 1
    assert payload["metrics"]["agreement_coverage_avg"] == 0.95
    assert payload["corpus_empty"] is False
    assert code == 0


def test_run_explicit_observations_override_walker(
    tmp_path: Path, monkeypatch
) -> None:
    """Caller-supplied observations must NOT trigger a corpus walk —
    test_run_writes_last_metrics_json and friends rely on this so they
    don't accidentally pick up a populated repo corpus."""
    corpora = tmp_path / "corpora"
    _make_webp(corpora / "scene_X" / "capture-1" / "frame-0.webp")

    from pipeline_service.eval import corpus_walker as cw

    def boom(item, payload):
        raise AssertionError("walker must not be invoked")

    monkeypatch.setattr(cw, "default_pipeline_runner", boom)

    code, payload = run(
        observations=[_obs(agreementCoverage=0.5)],
        pairs=[],
        corpora_dir=corpora,
        thresholds_path=tmp_path / "no-thresh.json",
        output_path=tmp_path / "out.json",
    )
    assert payload["metrics"]["n_observations"] == 1
    assert payload["metrics"]["agreement_coverage_avg"] == 0.5


def test_eval_mock_backends_forces_non_gating(tmp_path: Path, monkeypatch) -> None:
    """EVAL_MOCK_BACKENDS=1 must disable gating regardless of corpus
    state — synthetic detector outputs should never gate CI."""
    monkeypatch.setenv("EVAL_MOCK_BACKENDS", "1")
    code, payload = run(
        observations=[
            _obs(agreementCoverage=0.0, agreementPrecision=0.0),
        ],
        pairs=[],
        corpora_dir=tmp_path / "no-corpus",
        thresholds_path=tmp_path / "no-thresh.json",
        output_path=tmp_path / "out.json",
    )
    assert payload["gating"] is False
    assert payload["violations"] == []
    assert code == 0


def test_eval_real_backends_keeps_gating_when_corpus_present(tmp_path: Path, monkeypatch) -> None:
    """Sanity inverse of the above: with EVAL_MOCK_BACKENDS unset and
    real-shape observations, gating runs."""
    monkeypatch.delenv("EVAL_MOCK_BACKENDS", raising=False)
    thresh = tmp_path / "thresholds.json"
    thresh.write_text(
        json.dumps({"gating": {"agreement_coverage_min": 0.99}, "warn": {}})
    )
    code, payload = run(
        observations=[_obs(agreementCoverage=0.5, agreementPrecision=0.0)],
        pairs=[],
        corpora_dir=tmp_path / "no-corpus",
        thresholds_path=thresh,
        output_path=tmp_path / "out.json",
        gating=True,  # explicit; covers when caller forces gating
    )
    assert payload["gating"] is True
    assert any("agreement_coverage" in v for v in payload["violations"])
    assert code == 1
