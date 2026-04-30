"""sentence-transformers/all-MiniLM-L6-v2 loader shell for label_text_compat.

Real impl lands in section-06 (cross_pass_dedup / cross_frame_dedup).
"""
from __future__ import annotations


class LabelEncoder:
    name = "label_encoder"

    def __init__(self) -> None:
        self.loaded = False

    async def warmup(self) -> None:  # pragma: no cover
        return None
