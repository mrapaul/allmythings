from __future__ import annotations
import logging
from typing import Optional
import numpy as np
from PIL import Image
from ultralytics import YOLO

from .base import (
    BoundingBox, GatekeeperResult, FastDetection, VLMDetection, VLMPoint, ItemAttributes,
)
from ..config import settings
from ..sahi import generate_tiles, remap_box_to_full, nms

log = logging.getLogger(__name__)


class MLXBackend:
    """Apple Silicon inference backend using MLX + Core ML + Metal.

    Implements fast_detect using YOLOE-11L with SAHI tiling.
    """

    def __init__(self) -> None:
        self._fast_loaded = False
        self._deep_loaded = False
        self._yoloe: Optional[YOLO] = None

    def load_fast_models(self) -> None:
        """Load YOLOE model for fast detection."""
        log.info("Loading YOLOE model: %s", settings.yoloe_model)
        self._yoloe = YOLO(settings.yoloe_model)
        self._fast_loaded = True
        log.info("YOLOE model loaded successfully")

    def load_deep_models(self) -> None:
        raise NotImplementedError("Deep models not implemented in this pipeline")

    def unload_deep_models(self) -> None:
        self._deep_loaded = False

    def gatekeeper(self, image: Image.Image, accept_prompts: list[str], reject_prompts: list[str]) -> GatekeeperResult:
        raise NotImplementedError("Gatekeeper not implemented in this pipeline")

    def fast_detect(self, image: Image.Image) -> list[FastDetection]:
        """Run YOLOE with SAHI tiling for comprehensive small-object detection."""
        if not self._fast_loaded:
            raise RuntimeError("Fast models not loaded — call load_fast_models() first")

        img_w, img_h = image.size
        tiles = generate_tiles(
            image_width=img_w,
            image_height=img_h,
            grid=(settings.sahi_grid_cols, settings.sahi_grid_rows),
            overlap=settings.sahi_overlap,
        )

        all_detections: list[dict] = []

        for tile in tiles:
            if tile["is_full"]:
                tile_img = image
            else:
                tile_img = image.crop((
                    tile["x"],
                    tile["y"],
                    tile["x"] + tile["width"],
                    tile["y"] + tile["height"],
                ))

            results = self._yoloe(
                tile_img,
                conf=settings.yoloe_confidence,
                verbose=False,
            )

            if not results or len(results) == 0:
                continue

            result = results[0]
            boxes_xyxyn = result.boxes.xyxyn.cpu().numpy()
            confidences = result.boxes.conf.cpu().numpy()
            class_ids = result.boxes.cls.cpu().numpy().astype(int)

            for i in range(len(boxes_xyxyn)):
                x1, y1, x2, y2 = boxes_xyxyn[i]
                box_local = {
                    "x": float(x1),
                    "y": float(y1),
                    "w": float(x2 - x1),
                    "h": float(y2 - y1),
                }

                if tile["is_full"]:
                    box_full = box_local
                else:
                    box_full = remap_box_to_full(box_local, tile, img_w, img_h)

                label = result.names.get(class_ids[i], "object")

                all_detections.append({
                    **box_full,
                    "label": label,
                    "confidence": float(confidences[i]),
                })

        deduped = nms(all_detections, iou_threshold=settings.sahi_nms_threshold)

        return [
            FastDetection(
                label=d["label"],
                box=BoundingBox(x=d["x"], y=d["y"], w=d["w"], h=d["h"]),
                confidence=d["confidence"],
                source="yoloe",
            )
            for d in deduped
        ]

    def embed_crop(self, crop: Image.Image) -> np.ndarray:
        raise NotImplementedError("Embeddings not implemented in this pipeline")

    def embed_text(self, text: str) -> np.ndarray:
        raise NotImplementedError("Embeddings not implemented in this pipeline")

    def vlm_enumerate(self, image: Image.Image, prompt: str) -> list[VLMDetection]:
        raise NotImplementedError("VLM not implemented in this pipeline")

    def vlm_points(self, image: Image.Image, prompt: str) -> list[VLMPoint]:
        raise NotImplementedError("VLM not implemented in this pipeline")

    def vlm_attributes(self, image: Image.Image, boxes: list[BoundingBox], prompt: str) -> list[ItemAttributes]:
        raise NotImplementedError("VLM not implemented in this pipeline")
