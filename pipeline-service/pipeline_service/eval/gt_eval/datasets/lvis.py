"""LVIS-OV dataset loader.

Concrete ``EvalDataset`` for LVIS rare-class subset filtered to indoor /
household supercategories. Downloads, caches (with sha256 verification +
pickle annotation cache), filters, and deterministically samples a
configurable number of images.

The expensive work happens at construction time. ``__iter__`` is a thin
generator that yields one ``(image_path, list[GtBox])`` pair per sampled
image, downloading per-image JPEGs lazily on first access.

Failure modes:
- ``LvisArchiveSha256Mismatch`` — archive sha256 does not match
  ``LvisConfig.expected_archive_sha256``. Operator should bump
  ``EVAL_LVIS_VERSION_BUMP`` after verifying the new archive is genuine.
- ``LvisDownloadError`` — network unreachable. The error message names
  the ``LVIS_LOCAL_ZIP`` env var so the operator knows the escape hatch.
"""
from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import pickle
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator

import numpy as np
import requests
from tqdm import tqdm

from pipeline_service.eval.gt_eval.datasets.protocol import GtBox

log = logging.getLogger(__name__)


_PACKAGE_ROOT = Path(__file__).resolve().parent
_DEFAULT_SUPERCATS_FILE = _PACKAGE_ROOT / "lvis_supercats.json"
_DEFAULT_ALIASES_FILE = _PACKAGE_ROOT / "lvis_aliases.json"
_DEFAULT_CACHE_ROOT = (
    Path(__file__).resolve().parents[4] / "eval" / "datasets" / "lvis-ov"
)

_LICENSE_TEXT = (
    "# LVIS / COCO 2017 Attribution\n\n"
    "This dataset cache contains material from two sources:\n\n"
    "1. **LVIS dataset** — annotations released under CC-BY 4.0.\n"
    "   https://www.lvisdataset.org\n"
    "2. **COCO 2017 dataset** — images released under CC-BY 4.0.\n"
    "   https://cocodataset.org\n\n"
    "Use of this cache must comply with both licenses, including\n"
    "attribution. This file is generated automatically by the\n"
    "GT-eval harness on first download.\n"
)


class LvisError(Exception):
    """Base class for LVIS loader errors."""


class LvisArchiveSha256Mismatch(LvisError):
    """Raised when the downloaded archive sha256 doesn't match the expected value."""


class LvisDownloadError(LvisError):
    """Raised when the network download fails. Mentions ``LVIS_LOCAL_ZIP``."""


@dataclass(frozen=True)
class LvisConfig:
    """Configuration for ``LvisDataset``. All defaults match §5.1 env defaults."""

    cache_root: Path = field(default_factory=lambda: _DEFAULT_CACHE_ROOT)
    sample_size: int = 500
    rare_class_only: bool = True
    indoor_supercats_only: bool = True
    download_url: str = "https://dl.fbaipublicfiles.com/LVIS/lvis_v1_train.json.zip"
    images_base_url: str = "https://images.cocodataset.org/train2017/"
    expected_archive_sha256: str | None = None
    seed: int = 0
    supercats_file: Path = field(default_factory=lambda: _DEFAULT_SUPERCATS_FILE)
    aliases_file: Path = field(default_factory=lambda: _DEFAULT_ALIASES_FILE)


def _file_sha256(path: Path, chunk_size: int = 1 << 20) -> str:
    """Compute the sha256 hex digest of a file by streaming."""
    h = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(chunk_size):
            h.update(chunk)
    return h.hexdigest()


def _stream_download(url: str, target: Path) -> None:
    """Stream-download ``url`` into ``target`` with a tqdm progress bar.

    Wraps any ``requests`` exception in ``LvisDownloadError`` so the
    error message can name ``LVIS_LOCAL_ZIP`` for operators.
    """
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".part")
    try:
        with requests.get(url, stream=True, timeout=60) as resp:
            resp.raise_for_status()
            total = int(resp.headers.get("content-length") or 0)
            with tmp.open("wb") as f, tqdm(
                total=total or None,
                unit="B",
                unit_scale=True,
                desc=target.name,
                leave=False,
            ) as bar:
                for chunk in resp.iter_content(chunk_size=1 << 20):
                    if not chunk:
                        continue
                    f.write(chunk)
                    bar.update(len(chunk))
    except requests.RequestException as exc:
        if tmp.exists():
            tmp.unlink(missing_ok=True)
        raise LvisDownloadError(
            f"Network download of {url!r} failed: {exc}. "
            "Set LVIS_LOCAL_ZIP=/path/to/lvis_v1_train.json.zip to use a "
            "pre-downloaded archive instead."
        ) from exc
    tmp.replace(target)


def _ensure_license_file(cache_root: Path) -> None:
    """Write ``LICENSE-LVIS.md`` once into ``cache_root`` (idempotent)."""
    target = cache_root / "LICENSE-LVIS.md"
    if not target.exists():
        cache_root.mkdir(parents=True, exist_ok=True)
        target.write_text(_LICENSE_TEXT, encoding="utf-8")


def _load_lvis_json(zip_path: Path, cache_root: Path) -> dict:
    """Load LVIS annotations dict, using a pickle cache when fresh."""
    pickle_cache = cache_root / "lvis_annotations.pkl"
    if pickle_cache.exists() and pickle_cache.stat().st_mtime > zip_path.stat().st_mtime:
        log.info("Loading LVIS annotations from pickle cache: %s", pickle_cache)
        with pickle_cache.open("rb") as f:
            return pickle.load(f)

    log.info("Parsing LVIS annotations JSON from %s", zip_path)
    with zipfile.ZipFile(zip_path, "r") as zf:
        json_member = next(
            (n for n in zf.namelist() if n.endswith(".json") and "/" not in n),
            None,
        )
        if json_member is None:
            json_member = next(n for n in zf.namelist() if n.endswith(".json"))
        with zf.open(json_member) as fh:
            data = json.load(io.TextIOWrapper(fh, encoding="utf-8"))

    cache_root.mkdir(parents=True, exist_ok=True)
    with pickle_cache.open("wb") as f:
        pickle.dump(data, f, protocol=pickle.HIGHEST_PROTOCOL)
    return data


def _read_supercats(supercats_file: Path) -> set[str]:
    """Read the supercategory allow-list as a set."""
    with supercats_file.open("r", encoding="utf-8") as f:
        payload = json.load(f)
    return set(payload.get("allowed", []))


class LvisDataset:
    """LVIS-OV concrete ``EvalDataset``: download, cache, filter, sample."""

    name: str = "lvis-ov"
    attribution_text: str = (
        "LVIS dataset (CC-BY 4.0). Images from COCO 2017 (CC-BY 4.0). "
        "https://www.lvisdataset.org · https://cocodataset.org"
    )

    def __init__(self, config: LvisConfig) -> None:
        self._config = config
        self._cache_root = Path(config.cache_root)
        self._cache_root.mkdir(parents=True, exist_ok=True)
        (self._cache_root / "images").mkdir(parents=True, exist_ok=True)

        self._archive_path = self._resolve_archive()
        self._version_sha256_value = _file_sha256(self._archive_path)
        if config.expected_archive_sha256 is not None and (
            config.expected_archive_sha256 != self._version_sha256_value
        ):
            log.error(
                "LVIS archive sha256 mismatch: expected=%s actual=%s",
                config.expected_archive_sha256,
                self._version_sha256_value,
            )
            raise LvisArchiveSha256Mismatch(
                "LVIS archive sha256 mismatch. "
                f"expected={config.expected_archive_sha256} "
                f"actual={self._version_sha256_value}. "
                "If the upstream archive has legitimately changed, set "
                "EVAL_LVIS_VERSION_BUMP=1 and update "
                "LvisConfig.expected_archive_sha256 to the new value."
            )
        if config.expected_archive_sha256 is None:
            log.warning(
                "LvisConfig.expected_archive_sha256 is unset — "
                "set it for reproducibility (current sha256=%s).",
                self._version_sha256_value,
            )

        _ensure_license_file(self._cache_root)

        annotations = _load_lvis_json(self._archive_path, self._cache_root)
        self._build_index(annotations)
        self._sample()

        log.info(
            "LVIS sampling complete: n_candidate_images=%d n_sampled=%d seed=%d",
            len(self._candidate_image_ids),
            len(self._sampled_image_ids),
            config.seed,
        )

    def _resolve_archive(self) -> Path:
        """Pick the archive source: LVIS_LOCAL_ZIP env var > cache file > download."""
        local_zip = os.environ.get("LVIS_LOCAL_ZIP")
        if local_zip:
            local_path = Path(local_zip).expanduser()
            if local_path.exists():
                log.info("LVIS_LOCAL_ZIP short-circuit: using %s", local_path)
                return local_path
            log.warning(
                "LVIS_LOCAL_ZIP=%s does not point at an existing file; "
                "falling back to download.",
                local_zip,
            )

        target = self._cache_root / "lvis_v1_train.json.zip"
        if target.exists():
            log.info("LVIS archive cache hit at %s", target)
            return target

        log.info(
            "Downloading LVIS archive from %s -> %s",
            self._config.download_url,
            target,
        )
        _stream_download(self._config.download_url, target)
        log.info("LVIS archive downloaded: %s", target)
        return target

    def _build_index(self, annotations: dict) -> None:
        """Filter categories and build the per-image GT-box index."""
        cats_by_id = {c["id"]: c for c in annotations["categories"]}

        if self._config.indoor_supercats_only:
            allowed_supercats = _read_supercats(self._config.supercats_file)
        else:
            allowed_supercats = None

        surviving_cat_ids: set[int] = set()
        for cat in annotations["categories"]:
            if self._config.rare_class_only and cat.get("frequency") != "r":
                continue
            if (
                allowed_supercats is not None
                and cat.get("supercategory") not in allowed_supercats
            ):
                continue
            surviving_cat_ids.add(cat["id"])

        per_image_boxes: dict[int, list[GtBox]] = {}
        for ann in annotations["annotations"]:
            cid = ann["category_id"]
            if cid not in surviving_cat_ids:
                continue
            x, y, w, h = ann["bbox"]
            cat = cats_by_id[cid]
            box = GtBox(
                x1=float(x),
                y1=float(y),
                x2=float(x) + float(w),
                y2=float(y) + float(h),
                category_id=int(cid),
                category_name=str(cat["name"]),
            )
            per_image_boxes.setdefault(int(ann["image_id"]), []).append(box)

        images_by_id = {img["id"]: img for img in annotations["images"]}

        self._cats_by_id = cats_by_id
        self._surviving_cat_ids = surviving_cat_ids
        self._per_image_boxes = per_image_boxes
        self._images_by_id = images_by_id
        self._candidate_image_ids = sorted(per_image_boxes.keys())
        self._category_names = sorted(
            {cats_by_id[cid]["name"] for cid in surviving_cat_ids}
        )

    def _sample(self) -> None:
        """Apply ``numpy.random.default_rng`` sampling for determinism."""
        n = min(self._config.sample_size, len(self._candidate_image_ids))
        if n == 0:
            self._sampled_image_ids = []
            return
        rng = np.random.default_rng(self._config.seed)
        chosen = rng.choice(
            np.asarray(self._candidate_image_ids, dtype=np.int64),
            size=n,
            replace=False,
        )
        self._sampled_image_ids = [int(x) for x in chosen]

    def _materialise_image(self, image_id: int) -> Path:
        """Return the local path for ``image_id``, downloading if needed."""
        meta = self._images_by_id[image_id]
        file_name = meta["file_name"]
        target = self._cache_root / "images" / file_name
        if target.exists():
            log.debug(
                "Image cache hit: id=%d path=%s n_boxes=%d",
                image_id,
                target,
                len(self._per_image_boxes[image_id]),
            )
            return target

        if os.environ.get("LVIS_LOCAL_ZIP"):
            try:
                with zipfile.ZipFile(self._archive_path, "r") as zf:
                    member = self._find_image_member(zf, file_name)
                    if member is not None:
                        target.parent.mkdir(parents=True, exist_ok=True)
                        with zf.open(member) as src, target.open("wb") as dst:
                            dst.write(src.read())
                        log.debug(
                            "Extracted image from local zip: id=%d -> %s",
                            image_id,
                            target,
                        )
                        return target
            except zipfile.BadZipFile as exc:
                raise LvisDownloadError(
                    f"LVIS_LOCAL_ZIP archive {self._archive_path!r} is not a valid zip: {exc}"
                ) from exc

        url = self._config.images_base_url.rstrip("/") + "/" + file_name
        log.debug("Downloading image: id=%d url=%s", image_id, url)
        _stream_download(url, target)
        return target

    @staticmethod
    def _find_image_member(zf: zipfile.ZipFile, file_name: str) -> str | None:
        """Find ``file_name`` inside the archive (with or without a leading dir)."""
        names = zf.namelist()
        for n in names:
            if n == file_name or n.endswith("/" + file_name):
                return n
        return None

    @property
    def category_names(self) -> list[str]:
        return list(self._category_names)

    @property
    def version_sha256(self) -> str:
        """sha256 of the LVIS annotations archive (used by §06 stamping)."""
        return self._version_sha256_value

    def __iter__(self) -> Iterator[tuple[Path, list[GtBox]]]:
        for image_id in self._sampled_image_ids:
            path = self._materialise_image(image_id)
            yield path, list(self._per_image_boxes[image_id])
