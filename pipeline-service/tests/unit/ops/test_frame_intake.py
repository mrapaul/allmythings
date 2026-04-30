"""§3.1 frame_intake — real op, not a stub."""
from __future__ import annotations

import hashlib
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image


def _bytes_with_orientation(orientation: int) -> bytes:
    """Build a tiny JPEG with an explicit EXIF orientation tag we can verify."""
    buf = BytesIO()
    img = Image.new("RGB", (8, 4), color=(10, 20, 30))
    exif = img.getexif()
    # 0x0112 = Orientation
    exif[0x0112] = orientation
    img.save(buf, format="JPEG", exif=exif)
    return buf.getvalue()


def _frame(frame_id: str, data: bytes, mime: str = "image/jpeg") -> dict:
    return {
        "frame_id": frame_id,
        "sha256": hashlib.sha256(data).hexdigest(),
        "mime_type": mime,
        "photo_bytes": data,
    }


def test_three_frames_in_three_frames_out(
    tiny_jpeg_bytes: bytes, isolated_env: dict[str, str]
) -> None:
    from pipeline_service.ops.frame_intake import frame_intake_impl

    inputs = [
        _frame(f"F{i}", tiny_jpeg_bytes) for i in range(3)
    ]
    out = frame_intake_impl(inputs)
    assert len(out) == 3
    assert all(not f.decoding_failed for f in out)
    assert {f.frame_id for f in out} == {"F0", "F1", "F2"}


def test_exif_orientation_preserved(isolated_env: dict[str, str]) -> None:
    from pipeline_service.ops.frame_intake import frame_intake_impl

    data = _bytes_with_orientation(orientation=6)  # rotate-90-CW
    out = frame_intake_impl([_frame("F1", data)])
    assert out[0].exif_orientation == 6


def test_exif_timestamp_stripped(isolated_env: dict[str, str]) -> None:
    """Build a JPEG carrying DateTimeOriginal + Orientation, ensure
    DateTime is stripped but Orientation survives. The on-disk re-encoded
    file is what we assert on.
    """
    from pipeline_service.ops.frame_intake import frame_intake_impl

    img = Image.new("RGB", (4, 4), color=(99, 88, 77))
    exif = img.getexif()
    exif[0x0112] = 1  # Orientation = top-left
    exif[0x9003] = "2026:04:30 09:00:00"  # DateTimeOriginal
    exif[0x010E] = "secret-image-description-marker"  # ImageDescription

    buf = BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    data = buf.getvalue()

    out = frame_intake_impl([_frame("F1", data)])
    assert out[0].exif_orientation == 1

    # The on-disk file's EXIF must no longer contain DateTime or Description.
    photo_dir = Path(isolated_env["PIPELINE_PHOTO_DIR"])
    sha = hashlib.sha256(data).hexdigest()
    persisted = next(photo_dir.glob(f"{sha}.*"))
    written = Image.open(persisted)
    written_exif = written.getexif()
    assert 0x9003 not in written_exif, "DateTimeOriginal must be stripped"
    assert 0x010E not in written_exif, "ImageDescription must be stripped"
    assert written_exif.get(0x0112) == 1, "Orientation must survive the strip"


def test_unsupported_mime_raises(isolated_env: dict[str, str]) -> None:
    from pipeline_service.ops.frame_intake import (
        UnsupportedMediaTypeError,
        frame_intake_impl,
    )

    with pytest.raises(UnsupportedMediaTypeError):
        frame_intake_impl([_frame("F1", b"not an image", mime="application/pdf")])


def test_one_bad_two_good_succeeds(
    tiny_jpeg_bytes: bytes, isolated_env: dict[str, str]
) -> None:
    """If a single frame fails decoding the op succeeds with one
    Frame(decoding_failed=True) and two good frames (§3.1)."""
    from pipeline_service.ops.frame_intake import frame_intake_impl

    bad = {
        "frame_id": "F-BAD",
        "sha256": hashlib.sha256(b"corrupt").hexdigest(),
        "mime_type": "image/jpeg",
        "photo_bytes": b"\x00\x00\x00not actually a jpeg",
    }
    good_a = _frame("F-A", tiny_jpeg_bytes)
    good_b = _frame("F-B", tiny_jpeg_bytes)

    out = frame_intake_impl([good_a, bad, good_b])
    by_id = {f.frame_id: f for f in out}
    assert by_id["F-BAD"].decoding_failed is True
    assert by_id["F-A"].decoding_failed is False
    assert by_id["F-B"].decoding_failed is False


def test_all_bad_raises(isolated_env: dict[str, str]) -> None:
    from pipeline_service.ops.frame_intake import (
        UnsupportedMediaTypeError,
        frame_intake_impl,
    )

    bad1 = {
        "frame_id": "F1",
        "sha256": "0" * 64,
        "mime_type": "image/jpeg",
        "photo_bytes": b"corrupt-1",
    }
    bad2 = {**bad1, "frame_id": "F2", "sha256": "1" * 64, "photo_bytes": b"corrupt-2"}
    bad3 = {**bad1, "frame_id": "F3", "sha256": "2" * 64, "photo_bytes": b"corrupt-3"}

    with pytest.raises(UnsupportedMediaTypeError):
        frame_intake_impl([bad1, bad2, bad3])


def test_writes_bytes_to_photo_dir(
    tiny_jpeg_bytes: bytes, isolated_env: dict[str, str]
) -> None:
    from pipeline_service.ops.frame_intake import frame_intake_impl

    sha = hashlib.sha256(tiny_jpeg_bytes).hexdigest()
    out = frame_intake_impl([_frame("F1", tiny_jpeg_bytes)])
    assert len(out) == 1

    photo_dir = Path(isolated_env["PIPELINE_PHOTO_DIR"])
    persisted = list(photo_dir.glob(f"{sha}.*"))
    assert len(persisted) == 1, (
        f"frame_intake must write {sha}.* to {photo_dir}, found {persisted}"
    )
    assert persisted[0].suffix == ".jpg"


def test_handles_legacy_single_frame_payload(
    tiny_jpeg_bytes: bytes, isolated_env: dict[str, str]
) -> None:
    """Defensive: a 1-element list (pre-burst v0 shape) must still produce
    one Frame, no error.
    """
    from pipeline_service.ops.frame_intake import frame_intake_impl

    out = frame_intake_impl([_frame("F-only", tiny_jpeg_bytes)])
    assert len(out) == 1
    assert out[0].frame_id == "F-only"


def test_writes_correct_extension_for_each_mime(
    tiny_png_bytes: bytes,
    tiny_webp_bytes: bytes,
    tiny_jpeg_bytes: bytes,
    isolated_env: dict[str, str],
) -> None:
    from pipeline_service.ops.frame_intake import frame_intake_impl

    inputs = [
        _frame("Fp", tiny_png_bytes, mime="image/png"),
        _frame("Fw", tiny_webp_bytes, mime="image/webp"),
        _frame("Fj", tiny_jpeg_bytes, mime="image/jpeg"),
    ]
    frame_intake_impl(inputs)

    photo_dir = Path(isolated_env["PIPELINE_PHOTO_DIR"])
    suffixes = sorted(p.suffix for p in photo_dir.iterdir())
    assert suffixes == [".jpg", ".png", ".webp"]
