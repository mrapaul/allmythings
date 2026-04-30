"""§3.1 frame_intake — REAL op.

Decodes incoming frame bytes (jpeg/png/webp), strips EXIF except Orientation,
writes a normalised copy to ``$PIPELINE_PHOTO_DIR/{sha256}.{ext}``, and emits
``Frame`` records. Per §3.0 the input list is sorted by ``frame_id`` for
deterministic op behaviour.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any, Iterable

import numpy as np
from PIL import Image, UnidentifiedImageError

from pipeline_service.config import load_config
from pipeline_service.types import Frame

logger = logging.getLogger("pipeline_service.ops.frame_intake")

_SUPPORTED_MIMES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

_EXIF_ORIENTATION_TAG = 0x0112  # ExifTags.Base.Orientation


class UnsupportedMediaTypeError(Exception):
    """Raised when no supplied frame has a supported mime type / decodable
    payload. Non-retryable per §3.1.
    """


def _ext_for_mime(mime: str) -> str | None:
    return _SUPPORTED_MIMES.get(mime.lower().strip())


def _orientation_only_exif(img: Image.Image) -> Image.Exif:
    """Return a fresh Exif object retaining only the Orientation tag."""
    src = img.getexif()
    out = Image.Exif()
    if _EXIF_ORIENTATION_TAG in src:
        out[_EXIF_ORIENTATION_TAG] = src[_EXIF_ORIENTATION_TAG]
    return out


def _decode_one(payload: dict[str, Any]) -> tuple[Frame, bytes | None]:
    """Decode a single frame payload.

    Returns a tuple ``(Frame, written_bytes_or_None)``. The second slot is
    the EXIF-stripped re-encoded bytes if the decode succeeded, ``None`` for
    failed decodes.
    """
    frame_id = str(payload["frame_id"])
    mime = str(payload.get("mime_type", "image/jpeg"))
    ext = _ext_for_mime(mime)
    if ext is None:
        raise UnsupportedMediaTypeError(f"unsupported mime: {mime!r}")
    raw_bytes: bytes = payload["photo_bytes"]
    try:
        img = Image.open(BytesIO(raw_bytes))
        img.load()
    except (UnidentifiedImageError, OSError, ValueError):
        # Decode failed — emit Frame(decoding_failed=True), let the run continue.
        return (
            Frame(
                frame_id=frame_id,
                rgb_bytes=b"",
                rgb_shape=(0, 0, 3),
                exif_orientation=1,
                decoding_failed=True,
            ),
            None,
        )

    exif_strip = _orientation_only_exif(img)
    orientation = int(exif_strip.get(_EXIF_ORIENTATION_TAG, 1))
    rgb = img.convert("RGB")
    arr = np.asarray(rgb, dtype=np.uint8)

    out_buf = BytesIO()
    pillow_format = {
        ".jpg": "JPEG",
        ".png": "PNG",
        ".webp": "WEBP",
    }[ext]
    save_kwargs: dict[str, Any] = {"exif": exif_strip}
    if pillow_format == "JPEG":
        save_kwargs["quality"] = 90
    rgb.save(out_buf, format=pillow_format, **save_kwargs)
    written = out_buf.getvalue()

    frame = Frame(
        frame_id=frame_id,
        rgb_bytes=arr.tobytes(),
        rgb_shape=arr.shape,  # type: ignore[arg-type]
        rgb_dtype="uint8",
        exif_orientation=orientation,
        captured_at=datetime.now(timezone.utc),
        decoding_failed=False,
    )
    return frame, written


def frame_intake_impl(frames: Iterable[dict[str, Any]]) -> list[Frame]:
    """Pure entry point used by tests + Dagster op alike.

    Input shape is documented in §3.1 of the plan: ``list[{photo_bytes,
    sha256, frame_id, mime_type}]``.
    """
    cfg = load_config()
    photo_dir = cfg.photo_dir
    photo_dir.mkdir(parents=True, exist_ok=True)

    # Determinism: sort by frame_id so list-order does not change output.
    sorted_frames = sorted(list(frames), key=lambda f: str(f["frame_id"]))
    if not sorted_frames:
        raise UnsupportedMediaTypeError("no frames supplied")

    out: list[Frame] = []
    successes = 0
    for payload in sorted_frames:
        try:
            frame, written = _decode_one(payload)
        except UnsupportedMediaTypeError:
            # An individual frame with a categorically-unsupported mime is a
            # decode failure, not a run-level abort — UNLESS every other frame
            # is also unsupported (handled below).
            frame = Frame(
                frame_id=str(payload["frame_id"]),
                rgb_bytes=b"",
                rgb_shape=(0, 0, 3),
                exif_orientation=1,
                decoding_failed=True,
            )
            written = None

        if not frame.decoding_failed and written is not None:
            sha = str(payload["sha256"])
            ext = _ext_for_mime(str(payload.get("mime_type", "image/jpeg"))) or ".bin"
            target: Path = photo_dir / f"{sha}{ext}"
            target.write_bytes(written)
            successes += 1
        out.append(frame)

    if successes == 0:
        raise UnsupportedMediaTypeError(
            f"all {len(sorted_frames)} frames failed decoding"
        )
    return out


# Dagster ``@op`` wrapping for this op lives in ``pipeline_service.dagster_defs``
# so the graph can read run-config and decode hex-encoded frame bytes once.
