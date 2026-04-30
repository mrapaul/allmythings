from __future__ import annotations

import os
from pathlib import Path
from typing import Iterator

import pytest


@pytest.fixture
def tmp_dagster_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    home = tmp_path / "dagster"
    home.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("DAGSTER_HOME", str(home))
    return home


@pytest.fixture
def tmp_photo_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    photos = tmp_path / "photos"
    photos.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("PIPELINE_PHOTO_DIR", str(photos))
    return photos


@pytest.fixture
def isolated_env(
    tmp_dagster_home: Path,
    tmp_photo_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[dict[str, str]]:
    """Isolate every env var the pipeline reads, so tests never touch the user's
    real ~/allmythings-data tree.
    """
    monkeypatch.setenv("PIPELINE_BIND_HOST", "127.0.0.1")
    monkeypatch.setenv("PIPELINE_PORT", "0")  # ephemeral if anything binds
    monkeypatch.setenv("PIPELINE_MAX_QUEUE_DEPTH", "4")
    monkeypatch.setenv("PIPELINE_RUN_RETENTION", "200")
    monkeypatch.setenv("PIPELINE_LOG_REDACTION", "true")
    yield {
        "DAGSTER_HOME": os.environ["DAGSTER_HOME"],
        "PIPELINE_PHOTO_DIR": os.environ["PIPELINE_PHOTO_DIR"],
    }


@pytest.fixture
def tiny_jpeg_bytes() -> bytes:
    """A minimal valid 4x4 JPEG. Used by frame_intake / assemble_result tests."""
    from io import BytesIO

    from PIL import Image

    buf = BytesIO()
    img = Image.new("RGB", (4, 4), color=(127, 64, 200))
    img.save(buf, format="JPEG", quality=80)
    return buf.getvalue()


@pytest.fixture
def tiny_png_bytes() -> bytes:
    from io import BytesIO

    from PIL import Image

    buf = BytesIO()
    img = Image.new("RGB", (4, 4), color=(0, 255, 0))
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def tiny_webp_bytes() -> bytes:
    from io import BytesIO

    from PIL import Image

    buf = BytesIO()
    img = Image.new("RGB", (4, 4), color=(20, 30, 40))
    img.save(buf, format="WEBP", quality=80)
    return buf.getvalue()
