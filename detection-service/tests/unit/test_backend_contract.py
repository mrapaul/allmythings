import pytest
from PIL import Image
from detection_service.backends.base import (
    InferenceBackend, GatekeeperResult, BoundingBox,
)
from detection_service.backends.mlx_backend import MLXBackend


def _dummy_image() -> Image.Image:
    return Image.new("RGB", (640, 480), (128, 128, 128))


def test_gatekeeper_result_shape():
    r = GatekeeperResult(accepted=True, margin=0.42, accept_score=0.9, reject_score=0.48, raw={})
    assert r.accepted
    assert r.margin == pytest.approx(0.42)


def test_bounding_box_normalized():
    b = BoundingBox(x=0.1, y=0.2, w=0.3, h=0.4)
    assert b.area() == pytest.approx(0.12)
    assert b.center() == (0.25, 0.4)


def test_mlx_backend_implements_protocol():
    b = MLXBackend()
    assert isinstance(b, InferenceBackend)


def test_mlx_fast_detect_raises_without_load():
    b = MLXBackend()
    with pytest.raises(RuntimeError, match="not loaded"):
        b.fast_detect(_dummy_image())
