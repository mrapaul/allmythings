#!/usr/bin/env python3
"""Merge flywheel COCO export + bootstrap COCO sets into one RF-DETR-ready
dataset: out/{train,valid,test}/ each with images and _annotations.coco.json,
all annotations remapped onto the unified taxonomy (taxonomy.json).

Usage:
  python3 training/dataset/build_detr_dataset.py \
      --flywheel datasets/export-2026-07-30 \
      --bootstrap training/data/bootstrap/indoor-objects \
      --out training/data/detr [--val-pct 10] [--test-pct 5] [--stats]
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from coco_sources import ImageEntry, gather_sources  # noqa: E402
from derive_taxonomy import DEFAULT_OUT, member_to_class  # noqa: E402
from label_norm import normalize_label  # noqa: E402


def assign_split(sha256_hex: str, val_pct: int = 10, test_pct: int = 5) -> str:
    bucket = int(sha256_hex[:8], 16) % 100
    if bucket < test_pct:
        return "test"
    if bucket < test_pct + val_pct:
        return "valid"
    return "train"


def load_derived(path: Path = DEFAULT_OUT) -> tuple[list, dict, dict]:
    """(classes, label -> class name, class name -> id) from the DERIVED
    taxonomy. Regenerate with derive_taxonomy.py when the data changes."""
    if not path.is_file():
        raise FileNotFoundError(
            f"{path} missing — run training/dataset/derive_taxonomy.py first "
            "(make train-dataset-detr does this automatically)"
        )
    payload = json.loads(path.read_text(encoding="utf-8"))
    classes = payload["classes"]
    return classes, member_to_class(classes), {c["name"]: c["id"] for c in classes}


def derived_coco_categories(classes: list) -> list:
    return [{"id": c["id"], "name": c["name"], "supercategory": "derived"} for c in classes]


def remap_entry(entry: ImageEntry, label_to_class: dict, class_ids: dict, stats: Counter) -> list:
    """Annotations -> derived class ids. A label absent from the derived
    taxonomy means the taxonomy is stale relative to the data; it is dropped
    and counted so the mismatch is visible rather than silent."""
    out = []
    for ann in entry.annotations:
        cat_name = entry.category_names.get(ann.get("category_id"), "")
        source_label = (
            ann.get("attributes", {}).get("label") or cat_name
            if entry.kind == "flywheel"
            else cat_name
        )
        bbox = list(ann.get("bbox", ()))
        if len(bbox) != 4 or bbox[2] <= 0 or bbox[3] <= 0:
            stats["anns_bad_bbox"] += 1
            continue
        class_name = label_to_class.get(normalize_label(source_label))
        if class_name is None:
            stats["anns_not_in_derived_taxonomy"] += 1
            continue
        out.append({"category_id": class_ids[class_name], "bbox": bbox})
        stats[f"anns_{entry.kind}"] += 1
    return out


def place_image(src: Path, dest: Path) -> None:
    if dest.exists():
        return
    try:
        os.link(src, dest)
    except OSError:
        shutil.copy2(src, dest)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--flywheel", type=Path, default=None)
    parser.add_argument("--bootstrap", type=Path, action="append", default=[])
    parser.add_argument("--out", type=Path, default=Path("training/data/detr"))
    parser.add_argument("--val-pct", type=int, default=10)
    parser.add_argument("--test-pct", type=int, default=5)
    parser.add_argument("--stats", action="store_true", help="print stats only, write nothing")
    args = parser.parse_args()

    if not args.flywheel and not args.bootstrap:
        parser.error("need --flywheel and/or --bootstrap")

    classes, label_to_class, class_ids = load_derived()
    stats: Counter = Counter()
    missing: list = []
    entries = gather_sources(args.flywheel, args.bootstrap, missing)
    print(f"derived classes: {len(classes)}")

    splits = {
        s: {"images": [], "annotations": [], "categories": derived_coco_categories(classes)}
        for s in ("train", "valid", "test")
    }
    placements = []  # (src, split, file_name)
    ids = {s: {"image": 0, "ann": 0} for s in splits}

    for entry in entries:
        anns = remap_entry(entry, label_to_class, class_ids, stats)
        if not anns:
            stats["images_empty_skipped"] += 1
            continue
        split = assign_split(entry.key, args.val_pct, args.test_pct)
        ids[split]["image"] += 1
        image_id = ids[split]["image"]
        file_name = f"{entry.key}{entry.path.suffix.lower()}"
        splits[split]["images"].append(
            {"id": image_id, "file_name": file_name, "width": entry.width, "height": entry.height}
        )
        for ann in anns:
            ids[split]["ann"] += 1
            x, y, w, h = ann["bbox"]
            splits[split]["annotations"].append(
                {
                    "id": ids[split]["ann"],
                    "image_id": image_id,
                    "category_id": ann["category_id"],
                    "bbox": [x, y, w, h],
                    "area": w * h,
                    "iscrowd": 0,
                }
            )
        placements.append((entry.path, split, file_name))
        stats[f"images_{split}"] += 1
        stats[f"images_{entry.kind}"] += 1

    for key in sorted(stats):
        print(f"{key:28s} {stats[key]}")
    print(f"{'images_missing_files':28s} {len(missing)}")
    if args.stats:
        return 0

    for split, coco in splits.items():
        split_dir = args.out / split
        split_dir.mkdir(parents=True, exist_ok=True)
        (split_dir / "_annotations.coco.json").write_text(
            json.dumps(coco, ensure_ascii=False), encoding="utf-8"
        )
    for src, split, file_name in placements:
        place_image(src, args.out / split / file_name)
    for split, coco in splits.items():
        print(
            f"wrote {len(coco['images']):5d} images / {len(coco['annotations']):6d} anns"
            f" -> {args.out / split}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
