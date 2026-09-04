import json

from vlm_records import (
    SourceItem,
    VALID_CATEGORIES,
    bbox_px_to_thousand,
    build_pass1_prompt,
    build_record,
    build_target,
    infer_scene_type,
    split_of,
)

SHA_A = "a" * 64
SHA_B = "0f" * 32


def test_bbox_px_to_thousand_scales_and_clamps():
    assert bbox_px_to_thousand((0, 0, 1000, 500), 1000, 500) == [0, 0, 1000, 1000]
    assert bbox_px_to_thousand((100, 50, 200, 100), 1000, 500) == [100, 100, 300, 300]
    assert bbox_px_to_thousand((-10, -10, 2000, 2000), 1000, 500) == [0, 0, 1000, 1000]


def test_bbox_never_degenerate():
    box = bbox_px_to_thousand((500, 250, 0.1, 0.1), 1000, 500)
    assert box[2] > box[0] and box[3] > box[1]


def test_prompt_matches_production_contract():
    prompt = build_pass1_prompt(1024, 768)
    assert "1024x768 pixels" in prompt
    assert '"bbox_2d" is [x1, y1, x2, y2]: exactly four integers on a 0-1000 scale' in prompt
    assert "|".join(VALID_CATEGORIES) in prompt
    assert "Emit \"scene\" BEFORE \"items\"" in prompt


def test_infer_scene_type():
    assert infer_scene_type([[0, 0, 800, 800]]) == "closeup"
    assert infer_scene_type([[0, 0, 100, 100], [200, 200, 300, 300]]) == "room"
    assert infer_scene_type([]) == "room"


def test_build_target_contract_shape_and_order():
    items = [
        SourceItem("navy blue couch", (100, 400, 600, 300), (), "Furniture"),
        SourceItem("brass floor lamp", (700, 100, 100, 500), ("gold", "brass"), "Lighting"),
        SourceItem("mystery gadget", (10, 10, 50, 50), (), None),
    ]
    target = build_target(items, 1000, 1000)
    assert set(target) == {"scene", "items"}
    assert target["scene"]["photo_quality"] == {"verdict": "ok", "reason": None}
    assert target["scene"]["estimated_total_items"] == 3
    # Reading order: sorted by y1 then x1.
    ys = [i["bbox_2d"][1] for i in target["items"]]
    assert ys == sorted(ys)
    assert [i["id"] for i in target["items"]] == [1, 2, 3]
    by_label = {i["object"]: i for i in target["items"]}
    assert by_label["navy blue couch"]["category"] == "Furniture"
    # No source tags -> unknown. Attributes are never inferred from label words:
    # the self-describing label already carries them.
    assert by_label["navy blue couch"]["tags"] == {"color": "unknown", "material": "unknown"}
    # Source tags are read positionally (production emits color, then material).
    assert by_label["brass floor lamp"]["tags"] == {"color": "gold", "material": "brass"}
    assert by_label["mystery gadget"]["category"] == "Other"
    for item in target["items"]:
        assert item["category"] in VALID_CATEGORIES
        assert set(item["tags"]) == {"color", "material"}


def test_build_record_is_ms_swift_messages_format():
    rec = build_record("/x/img.jpg", [SourceItem("vase", (10, 10, 20, 20), (), "Decor")], 640, 480)
    assert rec["images"] == ["/x/img.jpg"]
    assert [m["role"] for m in rec["messages"]] == ["user", "assistant"]
    assert rec["messages"][0]["content"].startswith("<image>")
    parsed = json.loads(rec["messages"][1]["content"])
    assert parsed["items"][0]["object"] == "vase"


def test_split_of_is_deterministic_and_valid():
    assert split_of(SHA_A) == split_of(SHA_A)
    assert {split_of(SHA_A), split_of(SHA_B)} <= {"train", "val"}
    assert split_of(SHA_A, val_pct=100) == "val"
    assert split_of(SHA_A, val_pct=0) == "train"


def test_resolve_tags_positional_and_defaults():
    from vlm_records import resolve_tags

    assert resolve_tags(()) == {"color": "unknown", "material": "unknown"}
    assert resolve_tags(("Navy",)) == {"color": "navy", "material": "unknown"}
    assert resolve_tags(("navy", "velvet", "modern")) == {"color": "navy", "material": "velvet"}
    assert resolve_tags(None) == {"color": "unknown", "material": "unknown"}


def test_resolve_category_only_accepts_production_enum():
    from vlm_records import resolve_category

    assert resolve_category("Furniture") == "Furniture"
    assert resolve_category("furniture") == "Furniture"
    # Never guesses: an unknown or absent category becomes Other.
    assert resolve_category("chair") == "Other"
    assert resolve_category(None) == "Other"
    assert resolve_category("") == "Other"


def test_labels_are_normalized_mechanically_not_semantically():
    target = build_target([SourceItem("Navy_Blue  Couch", (0, 0, 10, 10), (), None)], 100, 100)
    assert target["items"][0]["object"] == "navy blue couch"
