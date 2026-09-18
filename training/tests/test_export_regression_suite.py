"""Regression-suite exporter tests: synthetic flywheel jsonl in tmp_path, no
PHOTO_DIR dependency. Truth reconstruction and coverage rules mirror
flywheel-coco.ts (verifiedItems / latestRecordPerPhoto)."""

import json

import pytest
from export_regression_suite import (
    build_oracle,
    coverage_reason,
    latest_record_per_photo,
    load_records,
    reconstruct_truth,
    resolve_flywheel,
)

SHA_OK = "a" * 64
SHA_PARTIAL = "b" * 64
SHA_DARK = "c" * 64
SHA_EMPTY = "d" * 64
SHA_REREVIEWED = "e" * 64


def item(label, x=0.1):
    return {
        "label": label,
        "description": f"a {label}",
        "category": "Furniture",
        "tags": [],
        "box": {"x": x, "y": 0.1, "width": 0.2, "height": 0.2},
    }


def rec(sha, events, received_at, verdict=None):
    evs = list(events)
    if verdict is not None:
        evs.append({"type": "photo_verdict", "verdict": verdict, "userOverride": False})
    return {"photoSha256": sha, "model": "qwen3-vl:8b-instruct", "capturedAt": received_at,
            "scene": None, "events": evs, "receivedAt": received_at}


@pytest.fixture()
def flywheel_dir(tmp_path):
    d = tmp_path / "flywheel"
    d.mkdir()
    lines = [
        rec(SHA_OK, [
            {"type": "accept", "item": item("oak dining table")},
            {"type": "relabel", "item": item("sofa", 0.5), "newLabel": "linen sofa",
             "newTags": ["linen"]},
            {"type": "discard", "item": item("ghost chair", 0.9)},
        ], "2026-09-18T10:00:00Z", verdict="ok"),
        rec(SHA_PARTIAL, [
            {"type": "accept", "item": item("coffee table")},
        ], "2026-09-18T10:05:00Z"),
        rec(SHA_DARK, [
            {"type": "accept", "item": item("floor lamp")},
        ], "2026-09-18T10:10:00Z", verdict="too_dark"),
        rec(SHA_EMPTY, [
            {"type": "discard", "item": item("wobbly stool")},
        ], "2026-09-18T10:15:00Z", verdict="ok"),
        rec(SHA_REREVIEWED, [
            {"type": "accept", "item": item("first pass")},
        ], "2026-09-18T09:00:00Z", verdict="ok"),
        rec(SHA_REREVIEWED, [
            {"type": "accept", "item": item("second pass")},
        ], "2026-09-18T11:00:00Z", verdict="ok"),
    ]
    text = "\n".join(json.dumps(r) for r in lines) + "\nnot-json\n"
    (d / "2026-09-18.jsonl").write_text(text, encoding="utf-8")
    return d


def test_load_records_skips_bad_lines(flywheel_dir):
    records, bad = load_records(flywheel_dir)
    assert len(records) == 6
    assert bad == 1


def test_latest_record_per_photo_wins(flywheel_dir):
    records, _ = load_records(flywheel_dir)
    latest = latest_record_per_photo(records)
    assert set(latest) == {SHA_OK, SHA_PARTIAL, SHA_DARK, SHA_EMPTY, SHA_REREVIEWED}
    assert latest[SHA_REREVIEWED]["events"][0]["item"]["label"] == "second pass"


def test_reconstruct_truth_relabel_and_discard(flywheel_dir):
    records, _ = load_records(flywheel_dir)
    latest = latest_record_per_photo(records)
    truth = reconstruct_truth(latest[SHA_OK])
    assert [t["label"] for t in truth] == ["oak dining table", "linen sofa"]
    assert truth[1]["tags"] == ["linen"]


def test_reconstruct_truth_discard_removes_kept_item():
    sofa = item("sofa")
    record = rec("f" * 64, [
        {"type": "accept", "item": sofa},
        {"type": "discard", "item": dict(sofa)},
    ], "2026-09-18T12:00:00Z", verdict="ok")
    assert reconstruct_truth(record) == []


def test_coverage_reason_classification(flywheel_dir):
    records, _ = load_records(flywheel_dir)
    latest = latest_record_per_photo(records)
    assert coverage_reason(latest[SHA_OK], reconstruct_truth(latest[SHA_OK])) is None
    assert coverage_reason(latest[SHA_PARTIAL], reconstruct_truth(latest[SHA_PARTIAL])) == "no_photo_verdict"
    assert coverage_reason(latest[SHA_DARK], reconstruct_truth(latest[SHA_DARK])) == "scene_not_ok"
    assert coverage_reason(latest[SHA_EMPTY], reconstruct_truth(latest[SHA_EMPTY])) == "empty_truth"


def test_coverage_requires_item_events():
    record = rec("f" * 64, [], "2026-09-18T12:00:00Z", verdict="ok")
    assert coverage_reason(record, []) == "no_item_events"


def test_build_oracle_labels_only_with_slack_bounds():
    truth = [item(f"item {i}") for i in range(10)]
    oracle = build_oracle(truth)
    assert oracle["expected_items"] == [{"label": f"item {i}"} for i in range(10)]
    assert oracle["min_item_count"] == 6
    assert oracle["max_item_count"] == 14
    assert build_oracle([item("single")])["min_item_count"] == 1


def test_export_end_to_end(flywheel_dir, tmp_path, capsys):
    from export_regression_suite import main

    out = tmp_path / "regression-candidates"
    assert main(["--flywheel", str(flywheel_dir), "--out", str(out)]) == 0

    candidate = json.loads((out / f"{SHA_OK}.json").read_text(encoding="utf-8"))
    assert candidate["expected_items"] == [{"label": "linen sofa"}, {"label": "oak dining table"}]
    assert candidate["min_item_count"] == 2
    assert candidate["max_item_count"] == 4
    assert not (out / f"{SHA_PARTIAL}.json").exists()

    summary = json.loads((out / "summary.json").read_text(encoding="utf-8"))
    assert summary["photosReviewed"] == 5
    assert summary["candidatesEmitted"] == 2  # SHA_OK + SHA_REREVIEWED
    assert summary["candidatesNeedingHumanReview"] == 3
    reasons = {e["sha"]: e["reason"] for e in summary["needsHumanReview"]}
    assert reasons[SHA_PARTIAL] == "no_photo_verdict"
    assert reasons[SHA_DARK] == "scene_not_ok"
    assert reasons[SHA_EMPTY] == "empty_truth"
    assert "eval/oracle/ untouched" in capsys.readouterr().out


def test_resolve_flywheel_prefers_nested_dir(tmp_path):
    photo_dir = tmp_path / "data"
    (photo_dir / "flywheel").mkdir(parents=True)
    assert resolve_flywheel(str(photo_dir)) == photo_dir / "flywheel"
    assert resolve_flywheel(str(photo_dir / "flywheel")) == photo_dir / "flywheel"
    f = photo_dir / "flywheel" / "2026-09-18.jsonl"
    f.write_text("", encoding="utf-8")
    assert resolve_flywheel(str(f)) == f


def test_main_fails_cleanly_when_flywheel_missing(tmp_path, capsys):
    from export_regression_suite import main

    assert main(["--flywheel", str(tmp_path / "nope")]) == 1
    assert "nothing to export" in capsys.readouterr().out
