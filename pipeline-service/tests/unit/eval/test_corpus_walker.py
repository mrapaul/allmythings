"""Walker that converts on-disk corpora/<scene>/<capture>/frame-*.webp into
the inputs the Dagster pipeline expects, and rebuilds SceneObservations
from each pipeline run.

The §6/§7 plan requires this to bridge the populated corpus (section-09)
to the eval rig's gating logic (section-09 §6.5). Without it, a populated
corpus produces zero observations and gating fails spuriously.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

from pipeline_service.eval.corpus_walker import (
    CorpusItem,
    build_intake_payload,
    run_corpus,
    walk_corpus,
)
from pipeline_service.types import SceneObservation


# --- helpers -----------------------------------------------------------------


def _write_webp(path: Path, *, w: int = 32, h: int = 24, color=(120, 80, 40)) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (w, h), color=color).save(path, format="WEBP", quality=85)


def _populate(root: Path) -> None:
    """Two scenes, the first with two captures, the second with one."""
    for fi in range(3):
        _write_webp(root / "scene_A" / "capture-1" / f"frame-{fi}.webp")
        _write_webp(root / "scene_A" / "capture-2" / f"frame-{fi}.webp",
                    color=(40, 80, 120))
        _write_webp(root / "scene_B" / "capture-1" / f"frame-{fi}.webp",
                    color=(200, 200, 200))


# --- walk_corpus -------------------------------------------------------------


def test_walk_corpus_finds_scene_capture_triplets(tmp_path: Path) -> None:
    _populate(tmp_path)
    items = walk_corpus(tmp_path)
    # 2 scenes × variable captures; 3 capture-dirs total.
    assert len(items) == 3
    scene_ids = sorted({i.scene_id for i in items})
    assert scene_ids == ["scene_A", "scene_B"]
    a_caps = sorted(i.capture_id for i in items if i.scene_id == "scene_A")
    assert a_caps == ["capture-1", "capture-2"]


def test_walk_corpus_sorts_frames_deterministically(tmp_path: Path) -> None:
    _populate(tmp_path)
    items = walk_corpus(tmp_path)
    for item in items:
        names = [p.name for p in item.frame_paths]
        assert names == sorted(names), (
            f"frames must be deterministic; got {names}"
        )


def test_walk_corpus_skips_capture_dirs_without_frames(tmp_path: Path) -> None:
    _write_webp(tmp_path / "scene_X" / "capture-1" / "frame-0.webp")
    (tmp_path / "scene_X" / "capture-2").mkdir(parents=True)  # empty
    (tmp_path / "scene_X" / "capture-3").mkdir(parents=True)
    (tmp_path / "scene_X" / "capture-3" / "README.txt").write_text("not a frame")
    items = walk_corpus(tmp_path)
    cap_ids = [i.capture_id for i in items]
    assert cap_ids == ["capture-1"], (
        f"only capture-1 has frames; got {cap_ids}"
    )


def test_walk_corpus_handles_missing_dir(tmp_path: Path) -> None:
    items = walk_corpus(tmp_path / "does_not_exist")
    assert items == []


# --- build_intake_payload ----------------------------------------------------


def test_build_intake_payload_reads_webp_bytes(tmp_path: Path) -> None:
    _write_webp(tmp_path / "scene_A" / "capture-1" / "frame-0.webp")
    _write_webp(tmp_path / "scene_A" / "capture-1" / "frame-1.webp")
    item = walk_corpus(tmp_path)[0]
    payload = build_intake_payload(item)
    assert len(payload) == 2
    for entry in payload:
        assert entry["mime_type"] == "image/webp"
        assert isinstance(entry["photo_bytes"], (bytes, bytearray))
        assert len(entry["photo_bytes"]) > 0
        assert "sha256" in entry and len(entry["sha256"]) == 64
        assert entry["frame_id"].startswith("scene_A/capture-1/frame-")


def test_build_intake_payload_sha256_is_stable(tmp_path: Path) -> None:
    _write_webp(tmp_path / "s" / "c" / "frame-0.webp", color=(1, 2, 3))
    item = walk_corpus(tmp_path)[0]
    p1 = build_intake_payload(item)
    p2 = build_intake_payload(item)
    assert p1[0]["sha256"] == p2[0]["sha256"]


# --- run_corpus --------------------------------------------------------------


def _stub_observation(item: CorpusItem) -> SceneObservation:
    """Test runner: emit a deterministic observation per item."""
    obs = SceneObservation.empty(
        scene_id=item.scene_id,
        run_id=f"run-{item.scene_id}-{item.capture_id}",
        frame_ids=[p.name for p in item.frame_paths],
    )
    return obs.model_copy(
        update={"agreementCoverage": 0.9, "agreementPrecision": 0.5}
    )


def test_run_corpus_invokes_runner_per_capture(tmp_path: Path) -> None:
    _populate(tmp_path)
    seen: list[tuple[str, str]] = []

    def runner(item: CorpusItem, payload: list[dict]) -> SceneObservation:
        seen.append((item.scene_id, item.capture_id))
        assert payload, "runner must receive non-empty intake payload"
        return _stub_observation(item)

    obs, pairs = run_corpus(tmp_path, pipeline_runner=runner)
    assert len(obs) == 3
    assert sorted(seen) == [
        ("scene_A", "capture-1"),
        ("scene_A", "capture-2"),
        ("scene_B", "capture-1"),
    ]


def test_run_corpus_pairs_same_scene_captures(tmp_path: Path) -> None:
    _populate(tmp_path)
    obs, pairs = run_corpus(tmp_path, pipeline_runner=lambda i, _: _stub_observation(i))
    # Only scene_A has 2 captures, so only one pair (capture-1, capture-2).
    assert len(pairs) == 1
    a, b = pairs[0]
    assert a.sceneId == "scene_A" and b.sceneId == "scene_A"
    assert {a.runId, b.runId} == {
        "run-scene_A-capture-1",
        "run-scene_A-capture-2",
    }


def test_run_corpus_runner_failure_records_op_error(tmp_path: Path) -> None:
    """A pipeline run that raises must NOT abort the whole eval — it should
    produce a flagged SceneObservation with errors[] populated, so the
    op_failure_rate metric reflects reality."""
    _populate(tmp_path)

    def runner(item: CorpusItem, payload: list[dict]) -> SceneObservation:
        if item.scene_id == "scene_B":
            raise RuntimeError("simulated pipeline crash")
        return _stub_observation(item)

    obs, pairs = run_corpus(tmp_path, pipeline_runner=runner)
    # 2 successes + 1 failed = 3 observations.
    assert len(obs) == 3
    failed = [o for o in obs if o.errors]
    assert len(failed) == 1
    assert failed[0].sceneId == "scene_B"
    assert failed[0].errors[0].code == "RuntimeError"
    assert failed[0].flagged is True


def test_run_corpus_with_no_runner_uses_default(tmp_path: Path) -> None:
    """The default runner must be importable (it'll invoke Dagster). We
    don't exercise the real pipeline here, just confirm the symbol exists
    so production callers don't blow up at import time."""
    from pipeline_service.eval.corpus_walker import default_pipeline_runner

    assert callable(default_pipeline_runner)
