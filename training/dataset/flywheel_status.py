#!/usr/bin/env python3
"""Flywheel growth vs the retrain threshold.

Reads $PHOTO_DIR/flywheel/*.jsonl (same source as make dataset-export) and the
last-training marker training/data/last_train.json. Exit 0 when a retrain is
due, exit 1 otherwise, so make targets can branch on it.

Policy (research-backed): retrain when new verified photos since the last
round >= max(TRAIN_MIN_NEW_IMAGES, TRAIN_GROWTH_PCT% of the last round's set).
Every round trains a FRESH LoRA from the base model on the full accumulated
set — no sequential LoRA-on-LoRA.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

DEFAULT_MIN_NEW_IMAGES = 25
DEFAULT_GROWTH_PCT = 15
MARKER_PATH = Path(__file__).resolve().parents[1] / "data" / "last_train.json"


def count_flywheel(flywheel_dir: Path):
    """(records, unique photos, verified item events) across all jsonl files."""
    records = 0
    photos: set = set()
    verified_items = 0
    if not flywheel_dir.is_dir():
        return 0, 0, 0
    for f in sorted(flywheel_dir.glob("*.jsonl")):
        for line in f.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            records += 1
            if rec.get("photoSha256"):
                photos.add(rec["photoSha256"])
            for ev in rec.get("events", []):
                if ev.get("type") in ("accept", "relabel", "add_box"):
                    verified_items += 1
    return records, len(photos), verified_items


def should_retrain(current_images: int, last_images: int, min_new: int, growth_pct: int) -> bool:
    if current_images <= 0:
        return False
    new = current_images - last_images
    required = max(min_new, (last_images * growth_pct + 99) // 100)
    return new >= required


def read_marker(path: Path = MARKER_PATH) -> int:
    try:
        return int(json.loads(path.read_text(encoding="utf-8")).get("images", 0))
    except (OSError, ValueError):
        return 0


def main() -> int:
    photo_dir = Path(os.environ.get("PHOTO_DIR", str(Path.home() / "allmythings-data")))
    min_new = int(os.environ.get("TRAIN_MIN_NEW_IMAGES", DEFAULT_MIN_NEW_IMAGES))
    growth_pct = int(os.environ.get("TRAIN_GROWTH_PCT", DEFAULT_GROWTH_PCT))

    records, photos, verified_items = count_flywheel(photo_dir / "flywheel")
    last_images = read_marker()
    due = should_retrain(photos, last_images, min_new, growth_pct)

    print(f"flywheel records:        {records}")
    print(f"unique verified photos:  {photos}")
    print(f"verified item events:    {verified_items}")
    print(f"photos at last training: {last_images}")
    print(f"trigger: new >= max({min_new}, {growth_pct}% of last round)")
    print(f"retrain due:             {'YES' if due else 'no'}")
    if due:
        print("\nnext: make train-dataset-vlm train-dataset-detr, then on Lambda:")
        print("  bash training/lambda/launch.sh")
    return 0 if due else 1


if __name__ == "__main__":
    raise SystemExit(main())
