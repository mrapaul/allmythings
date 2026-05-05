"""Protocol-level tests for ``EvalDataset`` and ``GtBox``.

These three tests pin the public surface of the dataset Protocol so a
future v2 (OpenImages, etc.) cannot drift away from the contract the
orchestrator (§08) and metrics (§05) consume.
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterable

from pipeline_service.eval.gt_eval.datasets.protocol import EvalDataset, GtBox


def test_gtbox_is_namedtuple_with_documented_fields() -> None:
    """``GtBox`` is a NamedTuple with the documented field names + types."""
    box = GtBox(
        x1=1.0,
        y1=2.0,
        x2=3.0,
        y2=4.0,
        category_id=10,
        category_name="chair",
    )
    assert box.x1 == 1.0
    assert box.y1 == 2.0
    assert box.x2 == 3.0
    assert box.y2 == 4.0
    assert box.category_id == 10
    assert box.category_name == "chair"
    # NamedTuple-ness: positional unpack matches the same order.
    x1, y1, x2, y2, cid, cname = box
    assert (x1, y1, x2, y2, cid, cname) == (1.0, 2.0, 3.0, 4.0, 10, "chair")
    assert GtBox._fields == (
        "x1",
        "y1",
        "x2",
        "y2",
        "category_id",
        "category_name",
    )


def test_evaldataset_isinstance_check_passes_for_conforming_class() -> None:
    """A class with the full Protocol surface passes ``isinstance``."""

    class _GoodDS:
        name = "good"
        category_names: list[str] = ["chair"]
        version_sha256 = "deadbeef"
        attribution_text = "test"

        def __iter__(self) -> Iterable[tuple[Path, list[GtBox]]]:
            return iter([])

    assert isinstance(_GoodDS(), EvalDataset)


def test_evaldataset_isinstance_check_fails_for_missing_attribute() -> None:
    """A class missing any required attribute fails ``isinstance``."""

    class _MissingVersionSha:
        name = "bad"
        category_names: list[str] = []
        attribution_text = "x"

        def __iter__(self) -> Iterable[tuple[Path, list[GtBox]]]:
            return iter([])

    assert not isinstance(_MissingVersionSha(), EvalDataset)
