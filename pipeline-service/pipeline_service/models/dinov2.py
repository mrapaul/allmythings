"""DINOv2 ViT-B/14 loader shell (768-d via MLX).

Real impl lands in section-04 (scene_embedding + crop_embedding).
"""
from __future__ import annotations


class DinoV2Loader:
    name = "dinov2"

    def __init__(self) -> None:
        self.loaded = False

    async def warmup(self) -> None:  # pragma: no cover
        return None
