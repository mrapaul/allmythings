from __future__ import annotations
from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable
import numpy as np
from PIL import Image


@dataclass
class BoundingBox:
    x: float  # normalized 0..1
    y: float
    w: float
    h: float

    def area(self) -> float:
        return self.w * self.h

    def center(self) -> tuple[float, float]:
        return (self.x + self.w / 2, self.y + self.h / 2)

    def contains_point(self, pt_xy: tuple[float, float]) -> bool:
        px, py = pt_xy
        return self.x <= px <= self.x + self.w and self.y <= py <= self.y + self.h


@dataclass
class GatekeeperResult:
    accepted: bool
    margin: float
    accept_score: float
    reject_score: float
    raw: dict


@dataclass
class FastDetection:
    label: str
    box: BoundingBox
    confidence: float
    source: str = "yoloe"


@dataclass
class VLMDetection:
    label: str
    box: BoundingBox
    category_raw: str
    confidence: float


@dataclass
class VLMPoint:
    label: str
    xy: tuple[float, float]  # normalized 0..1


@dataclass
class ItemAttributes:
    label: str | None = None
    category_raw: str | None = None
    brand: str | None = None
    model: str | None = None
    colors: list[str] = field(default_factory=list)
    materials: list[str] = field(default_factory=list)
    condition: str | None = None
    estimated_value_usd: int | None = None
    description: str | None = None


@runtime_checkable
class InferenceBackend(Protocol):
    def load_fast_models(self) -> None: ...
    def load_deep_models(self) -> None: ...
    def unload_deep_models(self) -> None: ...

    def gatekeeper(self, image: Image.Image, accept_prompts: list[str], reject_prompts: list[str]) -> GatekeeperResult: ...
    def fast_detect(self, image: Image.Image) -> list[FastDetection]: ...
    def embed_crop(self, crop: Image.Image) -> np.ndarray: ...
    def embed_text(self, text: str) -> np.ndarray: ...

    # Deep pass — Plan B will implement; stubs raise for now
    def vlm_enumerate(self, image: Image.Image, prompt: str) -> list[VLMDetection]: ...
    def vlm_points(self, image: Image.Image, prompt: str) -> list[VLMPoint]: ...
    def vlm_attributes(self, image: Image.Image, boxes: list[BoundingBox], prompt: str) -> list[ItemAttributes]: ...
