"""EvalDataset Protocol + GtBox NamedTuple.

A pluggable ground-truth dataset abstraction. v1 ships LvisDataset as the
sole concrete impl; v2 will add OpenImages etc. without changing any of
the metric / orchestrator code that consumes the iterable.
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterable, NamedTuple, Protocol, runtime_checkable


class GtBox(NamedTuple):
    """One ground-truth box.

    xyxy in PIXEL coordinates, top-left origin, max edges EXCLUSIVE
    (so ``iou(GtBox(0,0,10,10,...), GtBox(10,0,20,10,...)) == 0`` for
    touching boxes).
    """

    x1: float
    y1: float
    x2: float
    y2: float
    category_id: int
    category_name: str


@runtime_checkable
class EvalDataset(Protocol):
    """A pluggable GT dataset; iterable of (image_path, [GtBox])."""

    name: str
    category_names: list[str]
    version_sha256: str
    attribution_text: str

    def __iter__(self) -> Iterable[tuple[Path, list[GtBox]]]: ...
