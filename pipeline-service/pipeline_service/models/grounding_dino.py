"""Grounding DINO 1.5 Edge loader shell.

Section-05 implements real model loading on Apple Silicon. Section-01
exports the class signature only.
"""
from __future__ import annotations


class GroundingDinoLoader:
    name = "grounding_dino"

    def __init__(self) -> None:
        self.loaded = False

    async def warmup(self) -> None:  # pragma: no cover
        return None
