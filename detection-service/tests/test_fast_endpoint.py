import io
import pytest
from unittest.mock import patch, MagicMock
from httpx import AsyncClient, ASGITransport
from PIL import Image

from detection_service.backends.base import FastDetection, BoundingBox


@pytest.fixture
def dummy_jpeg_bytes() -> bytes:
    img = Image.new("RGB", (640, 480), (100, 150, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def mock_backend():
    mock = MagicMock()
    mock.fast_detect.return_value = [
        FastDetection(label="chair", box=BoundingBox(x=0.1, y=0.2, w=0.3, h=0.4), confidence=0.85),
        FastDetection(label="lamp", box=BoundingBox(x=0.5, y=0.1, w=0.1, h=0.2), confidence=0.72),
    ]
    return mock


@pytest.mark.asyncio
async def test_detect_fast_returns_detections(dummy_jpeg_bytes, mock_backend):
    with patch("main._backend", mock_backend):
        from main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/detect/fast",
                files={"file": ("test.jpg", dummy_jpeg_bytes, "image/jpeg")},
            )
    assert response.status_code == 200
    data = response.json()
    assert "detections" in data
    assert len(data["detections"]) == 2
    assert data["detections"][0]["label"] == "chair"
    assert data["detections"][0]["provider"] == "yoloe"
    assert "processing_ms" in data
    assert "tiles_used" in data


@pytest.mark.asyncio
async def test_detect_fast_rejects_non_image(mock_backend):
    with patch("main._backend", mock_backend):
        from main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/detect/fast",
                files={"file": ("test.txt", b"not an image", "text/plain")},
            )
    assert response.status_code == 400
