import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image


@pytest.fixture
def test_image_bytes() -> bytes:
    """Create a simple test image in memory."""
    img = Image.new("RGB", (640, 480), color=(128, 128, 128))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def client():
    from detection_service.main import app
    return TestClient(app)


def test_florence_returns_regions(client, test_image_bytes):
    """Florence endpoint returns list of regions with captions and bboxes."""
    response = client.post(
        "/detect/florence",
        files={"file": ("test.jpg", test_image_bytes, "image/jpeg")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "regions" in data
    assert "image_width" in data
    assert "image_height" in data
    assert isinstance(data["regions"], list)
    for region in data["regions"]:
        assert "caption" in region
        assert "x" in region
        assert "y" in region
        assert "width" in region
        assert "height" in region
        assert 0.0 <= region["x"] <= 1.0
        assert 0.0 <= region["y"] <= 1.0


def test_florence_rejects_non_image(client):
    """Florence endpoint rejects non-image files."""
    response = client.post(
        "/detect/florence",
        files={"file": ("test.txt", b"not an image", "text/plain")},
    )
    assert response.status_code == 415


def test_florence_applies_exif_rotation(client):
    """An EXIF Orientation=6 (90° CW) JPEG must be rotated upright before
    inference, so reported image_width/image_height match the visually-
    upright image, not the raw sensor pixels.

    iPhone photos default to landscape sensor + Orientation=6; without this
    rotation Florence-2's dense-region head collapses to a single whole-
    scene caption on the sideways image.
    """
    # Build a 1280×720 (landscape pixels) JPEG with Orientation=6 set.
    # When properly rotated for display it becomes 720×1280 (portrait).
    img = Image.new("RGB", (1280, 720), color=(64, 64, 64))
    exif = img.getexif()
    exif[274] = 6  # 274 is the Orientation tag
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif.tobytes())

    response = client.post(
        "/detect/florence",
        files={"file": ("rotated.jpg", buf.getvalue(), "image/jpeg")},
    )
    assert response.status_code == 200
    data = response.json()
    # After exif_transpose, the upright image is 720×1280 — width/height
    # swapped relative to the raw stored pixel buffer.
    assert data["image_width"] == 720
    assert data["image_height"] == 1280
