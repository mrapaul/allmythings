from __future__ import annotations
import logging
from typing import Optional
import numpy as np
from PIL import Image

from .base import (
    BoundingBox, GatekeeperResult, FastDetection, VLMDetection, VLMPoint, ItemAttributes,
)

log = logging.getLogger(__name__)


class MLXBackend:
    """Apple Silicon inference backend using MLX + Core ML + Metal.

    Models loaded lazily:
      - Fast pool: CLIP ViT-B/32 (gatekeeper), YOLOE-11L (SAHI), CLIP ViT-L/14 (memory bank)
      - Deep pool: Qwen2.5-VL-32B MLX, Molmo-7B-D MLX (Plan B)
    """

    def __init__(self) -> None:
        self._fast_loaded = False
        self._deep_loaded = False
        self._clip_b32 = None
        self._clip_l14 = None
        self._yoloe = None
        self._sahi_model = None
        self._qwen = None
        self._molmo = None

    def load_fast_models(self) -> None:
        """Load CLIP ViT-B/32, YOLOE-11L, CLIP ViT-L/14. Implemented incrementally in Tasks 13-15."""
        raise NotImplementedError("load_fast_models is implemented incrementally in Tasks 13-15")

    def load_deep_models(self) -> None:
        raise NotImplementedError("Deep models are Plan B")

    def unload_deep_models(self) -> None:
        self._qwen = None
        self._molmo = None
        self._deep_loaded = False

    def gatekeeper(self, image: Image.Image, accept_prompts, reject_prompts) -> GatekeeperResult:
        if not self._fast_loaded:
            raise RuntimeError("Fast models not loaded — call load_fast_models() first")
        raise NotImplementedError("implemented in Task 13")

    def fast_detect(self, image: Image.Image) -> list[FastDetection]:
        if not self._fast_loaded:
            raise RuntimeError("Fast models not loaded — call load_fast_models() first")
        raise NotImplementedError("implemented in Task 15")

    def embed_crop(self, crop: Image.Image) -> np.ndarray:
        if not self._fast_loaded:
            raise RuntimeError("Fast models not loaded — call load_fast_models() first")
        raise NotImplementedError("implemented in Task 14")

    def embed_text(self, text: str) -> np.ndarray:
        if not self._fast_loaded:
            raise RuntimeError("Fast models not loaded — call load_fast_models() first")
        raise NotImplementedError("implemented in Task 14")

    def vlm_enumerate(self, image, prompt):
        raise NotImplementedError("Plan B — Deep Pass")

    def vlm_points(self, image, prompt):
        raise NotImplementedError("Plan B — Deep Pass")

    def vlm_attributes(self, image, boxes, prompt):
        raise NotImplementedError("Plan B — Deep Pass")
