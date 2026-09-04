#!/usr/bin/env python3
"""Fetch commercial-friendly bootstrap datasets in COCO format into
training/data/bootstrap/<name>. Nothing is bundled in the repo — downloads on
demand. Two source families:

- hf: keyless HuggingFace parquet sets via `datasets` streaming, capped per
  set (works TODAY, no accounts). Household relevance is enforced by mapping
  semantic similarity to a single domain seed phrase (no maintained object
  list) and requiring min_mappable in-domain objects per image.
- roboflow: CC BY 4.0 Universe sets, needs ROBOFLOW_API_KEY (free tier).

Research-only sets (Objects365, SKU-110K) and AGPL sets (HomeObjects-3K) are
deliberately absent.

Usage:
  python3 training/dataset/fetch_bootstrap.py [--source hf|roboflow|all]
      [--only NAME] [--list] [--cap N]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from domain_filter import JudgeUnavailable, in_domain  # noqa: E402
from label_norm import normalize_label  # noqa: E402

OUT_ROOT = Path(__file__).resolve().parents[1] / "data" / "bootstrap"

# Keyless HF parquet sets. bbox_format verified against datasets-server rows:
# detection-datasets/coco stores xyxy; Francesco/* (RF100) store COCO xywh.
HF_SETS = {
    "coco-household": {
        "repo": "detection-datasets/coco",
        "license": "COCO annotations CC BY 4.0",
        "splits": ("train",),
        "bbox_format": "xyxy",
        "cap": 1500,
        "min_mappable": 3,
    },
    "furniture-hf": {
        "repo": "Francesco/furniture-ngpea",
        "license": "CC BY 4.0 (Roboflow 100)",
        "splits": ("train", "validation", "test"),
        "bbox_format": "xywh",
        "cap": 800,
        "min_mappable": 1,
    },
}

# name -> (workspace, project, version, license) — all CC BY 4.0 on Roboflow
# Universe; verify the license on the page before any redistribution.
ROBOFLOW_SETS = {
    "furniture-detection": ("dayeng", "furniture-detection-lvd6k", 1, "CC BY 4.0"),
    "furniture-indoor": ("furncomp", "furniture-focused-indoor-dataset", 1, "CC BY 4.0"),
    "indoor-objects": ("project-tgiyj", "indoor-objects-4uctj", 1, "CC BY 4.0"),
    "household-goods": ("yolov5-epx0y", "household-uhdlf", 1, "CC BY 4.0"),
}


def _to_xywh(bbox, fmt: str) -> list:
    x1, y1, a, b = (float(v) for v in bbox)
    if fmt == "xyxy":
        return [x1, y1, max(0.0, a - x1), max(0.0, b - y1)]
    return [x1, y1, a, b]


def _class_names(features) -> list:
    """Resolve objects.category ClassLabel names across datasets-library
    generations (Sequence.feature dicts in 2.x/3.x, plain dict/List in 5.x)."""
    node = features["objects"]
    for _ in range(4):
        if isinstance(node, dict):
            node = node["category"]
        elif hasattr(node, "names"):
            return list(node.names)
        elif hasattr(node, "feature"):
            node = node.feature
        else:
            break
    if hasattr(node, "names"):
        return list(node.names)
    raise ValueError(f"cannot resolve class names from features: {features}")


def relevant_classes(class_names) -> set:
    """Source class names judged to belong to the home-inventory domain.
    Degrades to keeping every class (loudly) when the judge is unreachable — an
    over-inclusive dataset is recoverable, a silently empty one is not."""
    names = [n for n in dict.fromkeys(class_names) if normalize_label(n)]
    if not names:
        return set()
    try:
        kept = in_domain(names)
    except JudgeUnavailable as e:
        print(
            f"WARNING: domain judge unavailable ({e}) — keeping ALL {len(names)} source "
            "classes unfiltered. Start Ollama for a domain-filtered set.",
            file=sys.stderr,
        )
        return set(names)
    return kept


def image_file_name(repo: str, split: str, image_id) -> str:
    """Unique per (split, image_id): HF image_id restarts at 1 in every split,
    so a split-less name lets validation/test silently overwrite train images
    while their annotations keep pointing at the old file."""
    return f"{repo.split('/')[-1]}-{split}-{image_id}.jpg"


def _columnar_objects(objs) -> dict:
    """Rows may encode objects columnar ({field: [values]}) or as a list of
    per-object dicts; normalize to columnar."""
    if isinstance(objs, dict):
        return objs
    return {
        "category": [o["category"] for o in objs],
        "bbox": [o["bbox"] for o in objs],
    }


def fetch_hf(name: str, cfg: dict, cap: int | None = None) -> Path:
    from datasets import load_dataset  # runtime import: keep module offline-safe

    limit = cap or cfg["cap"]
    dest = OUT_ROOT / name
    images_dir = dest / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    coco: dict = {"images": [], "annotations": [], "categories": []}
    cat_ids: dict = {}
    ann_id = 0
    kept = 0

    for split in cfg["splits"]:
        if kept >= limit:
            break
        ds = load_dataset(cfg["repo"], split=split, streaming=True)
        class_names = _class_names(ds.features)
        keep_classes = relevant_classes(class_names)
        print(f"  {name}: {len(keep_classes)}/{len(class_names)} classes in domain", flush=True)
        for sample in ds:
            if kept >= limit:
                break
            objs = _columnar_objects(sample["objects"])
            mappable = [
                (class_names[c], _to_xywh(b, cfg["bbox_format"]))
                for c, b in zip(objs["category"], objs["bbox"])
                if class_names[c] in keep_classes
            ]
            if len(mappable) < cfg["min_mappable"]:
                continue
            kept += 1
            file_name = image_file_name(cfg["repo"], split, sample["image_id"])
            sample["image"].convert("RGB").save(images_dir / file_name, quality=90)
            coco["images"].append(
                {
                    "id": kept,
                    "file_name": f"images/{file_name}",
                    "width": sample["width"],
                    "height": sample["height"],
                }
            )
            for label, bbox in mappable:
                if label not in cat_ids:
                    cat_ids[label] = len(cat_ids) + 1
                    coco["categories"].append({"id": cat_ids[label], "name": label})
                ann_id += 1
                coco["annotations"].append(
                    {
                        "id": ann_id,
                        "image_id": kept,
                        "category_id": cat_ids[label],
                        "bbox": [round(v, 2) for v in bbox],
                        "area": round(bbox[2] * bbox[3], 2),
                        "iscrowd": 0,
                    }
                )
            if kept % 100 == 0:
                print(f"  {name}: {kept}/{limit} images", flush=True)

    (dest / "annotations.json").write_text(json.dumps(coco), encoding="utf-8")
    print(f"fetched {name}: {kept} images, {ann_id} annotations -> {dest}")
    return dest


def fetch_roboflow(name: str, workspace: str, project: str, version: int) -> Path:
    from roboflow import Roboflow  # runtime import: keep module offline-safe

    api_key = os.environ.get("ROBOFLOW_API_KEY")
    if not api_key:
        raise SystemExit("ROBOFLOW_API_KEY not set — get a free key at roboflow.com")
    dest = OUT_ROOT / name
    dest.mkdir(parents=True, exist_ok=True)
    rf = Roboflow(api_key=api_key)
    rf.workspace(workspace).project(project).version(version).download(
        "coco", location=str(dest), overwrite=False
    )
    return dest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", choices=("hf", "roboflow", "all"), default=None)
    parser.add_argument("--only", default=None)
    parser.add_argument("--cap", type=int, default=None, help="override per-set image cap (hf)")
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args()

    source = args.source or ("all" if os.environ.get("ROBOFLOW_API_KEY") else "hf")

    if args.list:
        for name, cfg in HF_SETS.items():
            print(f"{name:24s} hf://{cfg['repo']}  cap={cfg['cap']}  [{cfg['license']}]")
        for name, (ws, proj, ver, lic) in ROBOFLOW_SETS.items():
            print(f"{name:24s} roboflow://{ws}/{proj}:v{ver}  [{lic}] (needs ROBOFLOW_API_KEY)")
        return 0

    failures = 0
    if source in ("hf", "all"):
        for name, cfg in HF_SETS.items():
            if args.only and name != args.only:
                continue
            try:
                fetch_hf(name, cfg, args.cap)
            except Exception as e:  # noqa: BLE001 — one bad set must not block the rest
                failures += 1
                print(f"FAILED {name}: {e}", file=sys.stderr)
    if source in ("roboflow", "all"):
        for name, (ws, proj, ver, _lic) in ROBOFLOW_SETS.items():
            if args.only and name != args.only:
                continue
            try:
                dest = fetch_roboflow(name, ws, proj, ver)
                print(f"fetched {name} -> {dest}")
            except SystemExit:
                raise
            except Exception as e:  # noqa: BLE001
                failures += 1
                print(f"FAILED {name}: {e}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
