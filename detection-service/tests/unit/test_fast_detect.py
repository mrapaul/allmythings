import pytest
from unittest.mock import patch, MagicMock
from PIL import Image
from detection_service.backends.mlx_backend import MLXBackend
from detection_service.backends.base import FastDetection


def _dummy_image() -> Image.Image:
    return Image.new("RGB", (1000, 800), (128, 128, 128))


def test_load_fast_models_sets_flag():
    """After load_fast_models(), _fast_loaded should be True."""
    backend = MLXBackend()
    with patch("detection_service.backends.mlx_backend.YOLO") as mock_yolo:
        mock_yolo.return_value = MagicMock()
        backend.load_fast_models()
    assert backend._fast_loaded is True
    assert backend._yoloe is not None


def test_fast_detect_returns_list_of_fast_detection():
    """fast_detect should return a list of FastDetection dataclasses."""
    backend = MLXBackend()

    mock_model = MagicMock()
    mock_result = MagicMock()
    mock_result.boxes = MagicMock()
    mock_result.boxes.xyxyn = MagicMock()
    import numpy as np
    mock_result.boxes.xyxyn.cpu.return_value.numpy.return_value = np.array([
        [0.1, 0.2, 0.4, 0.6],
    ])
    mock_result.boxes.conf.cpu.return_value.numpy.return_value = np.array([0.85])
    mock_result.names = {0: "chair"}
    mock_result.boxes.cls.cpu.return_value.numpy.return_value = np.array([0])
    mock_model.return_value = [mock_result]

    backend._yoloe = mock_model
    backend._fast_loaded = True

    detections = backend.fast_detect(_dummy_image())

    assert isinstance(detections, list)
    assert len(detections) >= 1
    assert all(isinstance(d, FastDetection) for d in detections)
    assert detections[0].source == "yoloe"


def test_fast_detect_raises_without_load():
    """Calling fast_detect before load_fast_models should raise RuntimeError."""
    backend = MLXBackend()
    with pytest.raises(RuntimeError, match="not loaded"):
        backend.fast_detect(_dummy_image())
