import pytest
from detection_service.sahi import generate_tiles, remap_box_to_full, nms


def test_generate_tiles_produces_5_tiles():
    """2x2 grid + 1 full-image = 5 tiles."""
    tiles = generate_tiles(image_width=1000, image_height=800, grid=(2, 2), overlap=0.2)
    assert len(tiles) == 5


def test_tile_dimensions_with_overlap():
    """Each tile in a 2x2 grid with 20% overlap should be 60% of image size."""
    tiles = generate_tiles(image_width=1000, image_height=800, grid=(2, 2), overlap=0.2)
    quadrant_tiles = [t for t in tiles if not t["is_full"]]
    assert len(quadrant_tiles) == 4
    for t in quadrant_tiles:
        assert t["width"] == 600
        assert t["height"] == 480


def test_tiles_cover_full_image():
    """Union of all tile regions should cover the full image."""
    tiles = generate_tiles(image_width=100, image_height=100, grid=(2, 2), overlap=0.2)
    quadrant_tiles = [t for t in tiles if not t["is_full"]]
    assert any(t["x"] <= 0 and t["y"] <= 0 for t in quadrant_tiles)
    assert any(t["x"] + t["width"] >= 100 and t["y"] + t["height"] >= 100 for t in quadrant_tiles)


def test_remap_box_to_full_coordinates():
    tile = {"x": 500, "y": 0, "width": 500, "height": 400}
    box = {"x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4}
    remapped = remap_box_to_full(box, tile, image_width=1000, image_height=800)
    assert remapped["x"] == pytest.approx(0.55)
    assert remapped["y"] == pytest.approx(0.1)
    assert remapped["w"] == pytest.approx(0.15)
    assert remapped["h"] == pytest.approx(0.2)


def test_nms_removes_duplicates():
    boxes = [
        {"x": 0.1, "y": 0.1, "w": 0.3, "h": 0.3, "label": "cup", "confidence": 0.9},
        {"x": 0.12, "y": 0.12, "w": 0.28, "h": 0.28, "label": "mug", "confidence": 0.7},
    ]
    result = nms(boxes, iou_threshold=0.5)
    assert len(result) == 1
    assert result[0]["confidence"] == 0.9


def test_nms_preserves_distinct_boxes():
    boxes = [
        {"x": 0.0, "y": 0.0, "w": 0.2, "h": 0.2, "label": "a", "confidence": 0.9},
        {"x": 0.5, "y": 0.5, "w": 0.2, "h": 0.2, "label": "b", "confidence": 0.8},
        {"x": 0.0, "y": 0.5, "w": 0.2, "h": 0.2, "label": "c", "confidence": 0.7},
    ]
    result = nms(boxes, iou_threshold=0.5)
    assert len(result) == 3


def test_nms_empty_input():
    assert nms([], iou_threshold=0.5) == []
