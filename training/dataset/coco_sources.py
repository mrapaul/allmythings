"""Shared loading/indexing for COCO-format sources: the flywheel export
(api-service/src/services/flywheel-coco.ts shape) and downloaded bootstrap
sets. File I/O happens only inside functions — safe to import offline."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path

ANNOTATION_FILENAMES = ("annotations.json", "_annotations.coco.json")
HEX64 = re.compile(r"^[0-9a-f]{64}$")


@dataclass(frozen=True)
class ImageEntry:
    key: str  # photo sha256 — dedupe + split identity
    path: Path  # absolute path to the image file
    width: int
    height: int
    annotations: tuple  # raw COCO annotation dicts for this image
    category_names: dict  # category_id -> name
    kind: str  # "flywheel" | "bootstrap"


def find_annotation_file(root: Path) -> Path | None:
    for name in ANNOTATION_FILENAMES:
        candidate = root / name
        if candidate.is_file():
            return candidate
    coco_jsons = sorted(root.glob("*.json"))
    return coco_jsons[0] if coco_jsons else None


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def image_key(path: Path) -> str:
    stem = path.stem.lower()
    return stem if HEX64.match(stem) else sha256_of(path)


def coco_index(coco: dict):
    """(image_id -> image dict, image_id -> [annotations], category_id -> name)"""
    images = {img["id"]: img for img in coco.get("images", [])}
    anns_by_image: dict = {img_id: [] for img_id in images}
    for ann in coco.get("annotations", []):
        anns_by_image.setdefault(ann["image_id"], []).append(ann)
    cat_names = {c["id"]: c["name"] for c in coco.get("categories", [])}
    return images, anns_by_image, cat_names


def iter_coco_dir(root: Path, kind: str, missing: list | None = None):
    """Yield ImageEntry per usable image in a COCO directory.

    Image files are looked up next to the annotation file, in the same dir as
    file_name says, or under images/. Missing files are recorded, not fatal —
    bootstrap sets are fetched on demand and may be partial."""
    root = root.resolve()
    ann_file = find_annotation_file(root)
    if ann_file is None:
        raise FileNotFoundError(f"no COCO annotation json under {root}")
    coco = json.loads(ann_file.read_text(encoding="utf-8"))
    images, anns_by_image, cat_names = coco_index(coco)
    search_dirs = [ann_file.parent, root, root / "images"]
    for img_id, img in images.items():
        path = _find_image(search_dirs, img["file_name"])
        if path is None:
            if missing is not None:
                missing.append(img["file_name"])
            continue
        width, height = img.get("width", 0), img.get("height", 0)
        if not width or not height:
            if missing is not None:
                missing.append(img["file_name"])
            continue
        yield ImageEntry(
            key=image_key(path),
            path=path,
            width=width,
            height=height,
            annotations=tuple(anns_by_image.get(img_id, [])),
            category_names=cat_names,
            kind=kind,
        )


def _find_image(search_dirs, file_name: str) -> Path | None:
    for d in search_dirs:
        candidate = d / file_name
        if candidate.is_file():
            return candidate.resolve()
    return None


def expand_coco_roots(root: Path) -> list:
    """A Roboflow-style export nests splits (train/valid/test each holding its
    own _annotations.coco.json); expand to every dir that has annotations."""
    root = Path(root)
    if find_annotation_file(root) is not None:
        return [root]
    subdirs = [d for d in sorted(root.iterdir()) if d.is_dir() and find_annotation_file(d)]
    return subdirs or [root]


def gather_sources(flywheel_dir: Path | None, bootstrap_dirs, missing: list | None = None):
    """All entries, flywheel first, deduped by photo sha256 so a user-verified
    photo always beats a bootstrap copy of the same image."""
    seen: set = set()
    out: list = []
    sources = []
    if flywheel_dir:
        sources.append((Path(flywheel_dir), "flywheel"))
    for d in bootstrap_dirs:
        sources.extend((sub, "bootstrap") for sub in expand_coco_roots(Path(d)))
    for root, kind in sources:
        for entry in iter_coco_dir(root, kind, missing):
            if entry.key in seen:
                continue
            seen.add(entry.key)
            out.append(entry)
    return out
