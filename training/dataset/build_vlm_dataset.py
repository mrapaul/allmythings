#!/usr/bin/env python3
"""Build Qwen3-VL instruction-tuning JSONL (ms-swift messages format) from the
flywheel COCO export and/or bootstrap COCO sets.

TRAINING OBJECTIVE — PIPELINE DISTILLATION. Production reaches 96.1% oracle
recall by running two passes plus adaptive 2x2 tiling and dedupe, at ~125s per
photo; the best raw single call manages ~75% at ~12s. The goal of this dataset
is a model whose SINGLE full-frame call matches the tiled pipeline, so tiling
and pass-2 can be switched off for a ~10x latency win.

That is why every flywheel photo becomes ONE record containing ALL of its
human-verified items: those verified items are the merged output of the tiled,
deduped pipeline, so using them as a single-call target distils the whole
pipeline into the model. Targets therefore teach dense, complete enumeration
from one view — never a partial per-tile view.

Usage:
  python3 training/dataset/build_vlm_dataset.py \
      --flywheel datasets/export-2026-07-30 \
      --bootstrap training/data/bootstrap/indoor-objects \
      --out training/data/vlm [--val-pct 10] [--stats]
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from coco_sources import ImageEntry, gather_sources  # noqa: E402
from vlm_records import SourceItem, build_record, split_of  # noqa: E402


def entry_to_items(entry: ImageEntry, stats: Counter) -> list[SourceItem]:
    """COCO annotations -> SourceItems, open-vocabulary.

    No taxonomy, no semantic mapping: the label is whatever the source says
    (flywheel labels are user-verified and authoritative; bootstrap labels are
    the source's own class name). The coarse category is carried through only
    when the source already supplies a production-valid one — the flywheel
    export does, bootstrap COCO sets do not."""
    items: list[SourceItem] = []
    for ann in entry.annotations:
        cat_name = entry.category_names.get(ann.get("category_id"), "")
        bbox = tuple(ann.get("bbox", ()))
        if len(bbox) != 4 or bbox[2] <= 0 or bbox[3] <= 0:
            stats["items_bad_bbox"] += 1
            continue
        if entry.kind == "flywheel":
            attrs = ann.get("attributes", {})
            label = (attrs.get("label") or cat_name).strip()
            items.append(SourceItem(label, bbox, tuple(attrs.get("tags", [])), cat_name))
        else:
            items.append(SourceItem(cat_name.strip(), bbox, (), None))
        stats[f"items_{entry.kind}"] += 1
    return items


def build(entries, val_pct: int, stats: Counter):
    """One record per image holding every verified item on it — the distillation
    target described in the module docstring."""
    records = {"train": [], "val": []}
    for entry in entries:
        items = entry_to_items(entry, stats)
        if not items:
            stats["images_empty_skipped"] += 1
            continue
        record = build_record(str(entry.path), items, entry.width, entry.height)
        split = split_of(entry.key, val_pct)
        records[split].append(record)
        stats[f"images_{entry.kind}"] += 1
        stats[f"images_{split}"] += 1
    return records


def print_stats(stats: Counter, missing: list) -> None:
    for key in sorted(stats):
        print(f"{key:28s} {stats[key]}")
    print(f"{'images_missing_files':28s} {len(missing)}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--flywheel", type=Path, default=None)
    parser.add_argument("--bootstrap", type=Path, action="append", default=[])
    parser.add_argument("--out", type=Path, default=Path("training/data/vlm"))
    parser.add_argument("--val-pct", type=int, default=10)
    parser.add_argument("--stats", action="store_true", help="print stats only, write nothing")
    args = parser.parse_args()

    if not args.flywheel and not args.bootstrap:
        parser.error("need --flywheel and/or --bootstrap")

    stats: Counter = Counter()
    missing: list = []
    entries = gather_sources(args.flywheel, args.bootstrap, missing)
    records = build(entries, args.val_pct, stats)

    print_stats(stats, missing)
    if args.stats:
        return 0

    args.out.mkdir(parents=True, exist_ok=True)
    for split, recs in records.items():
        path = args.out / f"{split}.jsonl"
        with open(path, "w", encoding="utf-8") as f:
            for rec in recs:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        print(f"wrote {len(recs):5d} records -> {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
