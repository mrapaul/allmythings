import json

from flywheel_status import count_flywheel, should_retrain


def test_should_retrain_floor_applies_when_no_history():
    assert should_retrain(current_images=25, last_images=0, min_new=25, growth_pct=15)
    assert not should_retrain(current_images=24, last_images=0, min_new=25, growth_pct=15)
    assert not should_retrain(current_images=0, last_images=0, min_new=25, growth_pct=15)


def test_should_retrain_growth_pct_dominates_at_scale():
    # 15% of 1000 = 150 > floor of 25
    assert not should_retrain(1100, 1000, 25, 15)
    assert should_retrain(1150, 1000, 25, 15)


def test_count_flywheel(tmp_path):
    rec1 = {
        "photoSha256": "a" * 64,
        "events": [
            {"type": "accept", "item": {}},
            {"type": "discard", "item": {}},
            {"type": "relabel", "item": {}, "newLabel": "x", "newTags": []},
        ],
    }
    rec2 = {"photoSha256": "b" * 64, "events": [{"type": "add_box", "item": {}}]}
    dup = {"photoSha256": "a" * 64, "events": []}
    (tmp_path / "2026-07.jsonl").write_text(
        "\n".join(json.dumps(r) for r in (rec1, rec2, dup)) + "\nnot json\n", encoding="utf-8"
    )
    records, photos, verified = count_flywheel(tmp_path)
    assert records == 3
    assert photos == 2
    assert verified == 3


def test_count_flywheel_missing_dir(tmp_path):
    assert count_flywheel(tmp_path / "nope") == (0, 0, 0)
