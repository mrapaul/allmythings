"""EfficientSAM-Ti loader shell. Real impl lands in section-05."""
from __future__ import annotations


class EffSAMLoader:
    name = "effsam"

    def __init__(self) -> None:
        self.loaded = False

    async def warmup(self) -> None:  # pragma: no cover
        return None
