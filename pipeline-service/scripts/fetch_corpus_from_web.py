"""Fetch curated interior-design photos from public sources and slice each
into a 3-frame burst, populating ``pipeline-service/eval/corpora/``.

This is the magazine-fallback path for the section-09 corpus when an operator
cannot physically capture 5 rooms × 3 angles × 2 captures themselves.

Usage
-----
    cd pipeline-service
    uv run python scripts/fetch_corpus_from_web.py \\
        --manifest scripts/corpus_manifest.json

Each manifest entry looks like:

    {
      "scene_id": "scene_01_living_room",
      "captures": [
        {"capture_id": "capture-1", "url": "https://...image.jpg"}
      ],
      "attribution": "Source: vogueliving.com — © Publisher",
      "license_note": "Used locally for evaluation, not redistributed (corpora/ is gitignored)"
    }

The fetcher downloads each URL, then for every capture produces 3 burst
frames by slicing the source into LEFT / CENTRE / RIGHT framings. This is
NOT a substitute for a real burst (no inter-frame motion), but it gives the
multi-frame stability metric something non-degenerate to chew on so the
harness can be exercised end-to-end before real operator captures arrive.

Important: ``corpora/`` is gitignored. We never commit the fetched images.
The committed artifact is the manifest itself, which records the source
URLs and attributions for reproducibility.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CORPORA = REPO_ROOT / "eval" / "corpora"
DEFAULT_MANIFEST = REPO_ROOT / "scripts" / "corpus_manifest.json"

# Conservative crop ratios: each frame is a 90% width slice of the full image,
# offset to LEFT / CENTRE / RIGHT. This keeps the same physical scene visible
# in all three frames while introducing realistic inter-frame variation.
_FRAME_OFFSETS_X = (0.0, 0.05, 0.10)  # left, centre, right offset ratios
_FRAME_WIDTH_RATIO = 0.90

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


@dataclass(frozen=True)
class FetchResult:
    scene_id: str
    capture_id: str
    frames: list[Path]
    bytes_downloaded: int


def _slice_burst(src: Image.Image, dest_dir: Path) -> list[Path]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    src_w, src_h = src.size
    crop_w = int(src_w * _FRAME_WIDTH_RATIO)
    written: list[Path] = []
    for i, ox in enumerate(_FRAME_OFFSETS_X):
        x0 = int(src_w * ox)
        x1 = min(src_w, x0 + crop_w)
        frame = src.crop((x0, 0, x1, src_h))
        out = dest_dir / f"frame-{i}.webp"
        frame.save(out, format="WEBP", quality=85, method=4)
        written.append(out)
    return written


def _fetch_one(client: httpx.Client, url: str, *, max_retries: int = 4) -> bytes:
    """Fetch a single URL with exponential backoff on 429/5xx."""
    delay = 1.5
    last_exc: Exception | None = None
    for attempt in range(max_retries):
        try:
            r = client.get(url, follow_redirects=True, timeout=30.0)
            if r.status_code == 429 or r.status_code >= 500:
                # honour Retry-After if present
                retry_after = r.headers.get("retry-after")
                wait = float(retry_after) if retry_after and retry_after.isdigit() else delay
                time.sleep(wait)
                delay = min(delay * 2, 16.0)
                last_exc = httpx.HTTPStatusError(
                    f"transient {r.status_code}", request=r.request, response=r
                )
                continue
            r.raise_for_status()
            ctype = r.headers.get("content-type", "")
            if not ctype.lower().startswith("image/"):
                raise RuntimeError(
                    f"URL did not return an image (got Content-Type={ctype!r}): {url}"
                )
            return r.content
        except httpx.HTTPError as e:
            last_exc = e
            time.sleep(delay)
            delay = min(delay * 2, 16.0)
    assert last_exc is not None
    raise last_exc


def _process_capture(
    client: httpx.Client,
    *,
    scene_id: str,
    capture: dict[str, Any],
    corpora_root: Path,
) -> FetchResult:
    url = capture["url"]
    capture_id = capture["capture_id"]
    body = _fetch_one(client, url)
    src = Image.open(_BytesIO_or_die(body)).convert("RGB")
    dest = corpora_root / scene_id / capture_id
    frames = _slice_burst(src, dest)
    return FetchResult(
        scene_id=scene_id,
        capture_id=capture_id,
        frames=frames,
        bytes_downloaded=len(body),
    )


def _BytesIO_or_die(buf: bytes):
    import io

    return io.BytesIO(buf)


def fetch(manifest_path: Path, corpora_root: Path) -> list[FetchResult]:
    manifest = json.loads(manifest_path.read_text())
    if not isinstance(manifest, list):
        raise SystemExit(
            f"Manifest must be a JSON array of scene entries, got {type(manifest).__name__}"
        )

    results: list[FetchResult] = []
    headers = {"User-Agent": _USER_AGENT}
    first = True
    with httpx.Client(headers=headers) as client:
        for entry in manifest:
            scene_id = entry["scene_id"]
            for capture in entry.get("captures", []):
                if not first:
                    # Be polite to free image hosts (Wikimedia, etc.)
                    time.sleep(1.0)
                first = False
                try:
                    res = _process_capture(
                        client,
                        scene_id=scene_id,
                        capture=capture,
                        corpora_root=corpora_root,
                    )
                except (httpx.HTTPError, RuntimeError) as e:
                    print(
                        f"[fetcher] SKIP {scene_id}/{capture.get('capture_id')}: {e}",
                        file=sys.stderr,
                    )
                    continue
                results.append(res)
                print(
                    f"[fetcher] OK   {res.scene_id}/{res.capture_id} "
                    f"({res.bytes_downloaded} B → {len(res.frames)} frames)",
                    file=sys.stderr,
                )
    return results


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--manifest",
        type=Path,
        default=DEFAULT_MANIFEST,
        help=f"Path to corpus manifest JSON (default: {DEFAULT_MANIFEST})",
    )
    p.add_argument(
        "--corpora",
        type=Path,
        default=DEFAULT_CORPORA,
        help=f"Path to corpora/ output dir (default: {DEFAULT_CORPORA})",
    )
    args = p.parse_args(argv)

    if not args.manifest.exists():
        print(
            f"[fetcher] manifest not found: {args.manifest}",
            file=sys.stderr,
        )
        return 2

    args.corpora.mkdir(parents=True, exist_ok=True)
    results = fetch(args.manifest, args.corpora)
    print(
        f"[fetcher] done — {len(results)} captures populated under {args.corpora}",
        file=sys.stderr,
    )
    return 0 if results else 1


if __name__ == "__main__":
    raise SystemExit(main())
