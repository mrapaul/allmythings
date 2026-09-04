import json
from collections import Counter
from pathlib import Path

import pytest
from build_detr_dataset import (
    assign_split,
    derived_coco_categories,
    load_derived,
    remap_entry,
)
from coco_sources import ImageEntry

SHA = "b" * 64
CLASSES = [
    {"id": 1, "name": "sofa", "count": 5, "members": ["couch", "sofa"]},
    {"id": 2, "name": "table lamp", "count": 3, "members": ["table lamp"]},
]
LABEL_TO_CLASS = {"couch": "sofa", "sofa": "sofa", "table lamp": "table lamp"}
CLASS_IDS = {"sofa": 1, "table lamp": 2}


def entry(kind, anns, cats):
    return ImageEntry(SHA, Path("/x/img.jpg"), 640, 480, tuple(anns), cats, kind)


def test_assign_split_deterministic_and_partitioned():
    assert assign_split(SHA) == assign_split(SHA)
    assert assign_split(SHA, val_pct=0, test_pct=0) == "train"
    assert assign_split(SHA, val_pct=0, test_pct=100) == "test"
    assert assign_split(SHA, val_pct=100, test_pct=0) == "valid"


def test_derived_coco_categories_use_derived_ids():
    assert derived_coco_categories(CLASSES) == [
        {"id": 1, "name": "sofa", "supercategory": "derived"},
        {"id": 2, "name": "table lamp", "supercategory": "derived"},
    ]


def test_remap_entry_folds_synonym_onto_derived_class():
    stats = Counter()
    anns = [
        {"category_id": 1, "bbox": [1, 2, 30, 40], "attributes": {"label": "Couch"}},
        {"category_id": 1, "bbox": [5, 5, 0, 10], "attributes": {"label": "couch"}},
    ]
    out = remap_entry(entry("flywheel", anns, {1: "Furniture"}), LABEL_TO_CLASS, CLASS_IDS, stats)
    assert len(out) == 1
    assert out[0]["category_id"] == 1  # "Couch" folded onto derived class "sofa"
    assert stats["anns_bad_bbox"] == 1


def test_remap_entry_counts_labels_absent_from_derived_taxonomy():
    stats = Counter()
    anns = [
        {"category_id": 7, "bbox": [0, 0, 10, 10]},
        {"category_id": 8, "bbox": [0, 0, 10, 10]},
    ]
    out = remap_entry(
        entry("bootstrap", anns, {7: "flux capacitor", 8: "table lamp"}),
        LABEL_TO_CLASS,
        CLASS_IDS,
        stats,
    )
    assert len(out) == 1
    assert stats["anns_not_in_derived_taxonomy"] == 1


def test_load_derived_reads_generated_file(tmp_path):
    path = tmp_path / "derived_taxonomy.json"
    path.write_text(json.dumps({"classes": CLASSES}), encoding="utf-8")
    classes, label_to_class, class_ids = load_derived(path)
    assert classes == CLASSES
    assert label_to_class["couch"] == "sofa"
    assert class_ids == CLASS_IDS


def test_load_derived_errors_when_not_generated(tmp_path):
    with pytest.raises(FileNotFoundError, match="derive_taxonomy"):
        load_derived(tmp_path / "missing.json")
