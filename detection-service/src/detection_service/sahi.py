"""SAHI tiling utilities: generate tiles, remap coordinates, NMS deduplication."""
from __future__ import annotations


def generate_tiles(
    image_width: int,
    image_height: int,
    grid: tuple[int, int] = (2, 2),
    overlap: float = 0.2,
) -> list[dict]:
    cols, rows = grid
    tile_w = int(image_width * (1.0 / cols) * (1.0 + overlap))
    tile_h = int(image_height * (1.0 / rows) * (1.0 + overlap))

    tiles: list[dict] = []
    tiles.append({"x": 0, "y": 0, "width": image_width, "height": image_height, "is_full": True})

    for row in range(rows):
        for col in range(cols):
            x = int(col * image_width / cols)
            y = int(row * image_height / rows)
            tiles.append({"x": x, "y": y, "width": tile_w, "height": tile_h, "is_full": False})

    return tiles


def remap_box_to_full(
    box: dict,
    tile: dict,
    image_width: int,
    image_height: int,
) -> dict:
    x_abs = tile["x"] + box["x"] * tile["width"]
    y_abs = tile["y"] + box["y"] * tile["height"]
    w_abs = box["w"] * tile["width"]
    h_abs = box["h"] * tile["height"]

    return {
        "x": x_abs / image_width,
        "y": y_abs / image_height,
        "w": w_abs / image_width,
        "h": h_abs / image_height,
    }


def _iou(a: dict, b: dict) -> float:
    xa = max(a["x"], b["x"])
    ya = max(a["y"], b["y"])
    xb = min(a["x"] + a["w"], b["x"] + b["w"])
    yb = min(a["y"] + a["h"], b["y"] + b["h"])

    inter = max(0.0, xb - xa) * max(0.0, yb - ya)
    area_a = a["w"] * a["h"]
    area_b = b["w"] * b["h"]
    union = area_a + area_b - inter

    if union <= 0:
        return 0.0
    return inter / union


def nms(
    boxes: list[dict],
    iou_threshold: float = 0.5,
) -> list[dict]:
    if not boxes:
        return []

    sorted_boxes = sorted(boxes, key=lambda b: b["confidence"], reverse=True)
    keep: list[dict] = []

    for box in sorted_boxes:
        is_dup = False
        for kept in keep:
            if _iou(box, kept) > iou_threshold:
                is_dup = True
                break
        if not is_dup:
            keep.append(box)

    return keep
