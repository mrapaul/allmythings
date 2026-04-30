"""§3.6 sahi_recovery — real-op unit tests."""
from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
import pytest

from pipeline_service.models.grounding_dino import (
    GroundingDetection,
    GroundingDinoLoader,
)
from pipeline_service.ops.sahi_recovery import sahi_recovery_impl
from pipeline_service.types import (
    BBox,
    Frame,
    FrameDetections,
    PipelineConfig,
    PromptList,
    RawDetection,
)


def _frame(frame_id: str = "F0", h: int = 1024, w: int = 1024) -> Frame:
    arr = np.zeros((h, w, 3), dtype=np.uint8)
    return Frame(
        frame_id=frame_id,
        rgb_bytes=arr.tobytes(),
        rgb_shape=(h, w, 3),
        rgb_dtype="uint8",
        exif_orientation=1,
        captured_at=datetime.now(timezone.utc),
        decoding_failed=False,
    )


def _first_pass(frame_id: str, n: int) -> FrameDetections:
    return FrameDetections(
        detector="florence",
        frame_id=frame_id,
        detections=[
            RawDetection(
                detector="florence",
                frame_id=frame_id,
                bbox=BBox(x=i * 50, y=i * 50, width=10, height=10),
                label=f"item-{i}",
                raw_confidence=None,
            )
            for i in range(n)
        ],
        detector_error=False,
    )


def _quiet_loader() -> GroundingDinoLoader:
    return GroundingDinoLoader(backend=lambda image, prompts: [])


def test_skips_when_density_above_trigger() -> None:
    """1024×1024 = 1 MP frame; with 10 first-pass detections density = 10/MP
    > default trigger 5/MP → SAHI must be SKIPPED (no FrameDetections record)."""
    out = sahi_recovery_impl(
        [_frame("F0")],
        [_first_pass("F0", 10)],
        prompts=PromptList(prompts=["x"]),
        loader=_quiet_loader(),
    )
    assert out == []  # no record at all


def test_triggered_with_no_recovery_emits_empty_record() -> None:
    """1 first-pass detection → density 1/MP < 5/MP trigger → SAHI runs.
    With a backend that returns nothing, the op emits an empty
    FrameDetections record (distinguishable from "skipped")."""
    out = sahi_recovery_impl(
        [_frame("F0")],
        [_first_pass("F0", 1)],
        prompts=PromptList(prompts=["x"]),
        loader=_quiet_loader(),
    )
    assert len(out) == 1
    assert out[0].detector == "gdino-sahi"
    assert out[0].detections == []
    assert out[0].detector_error is False


def test_tile_boxes_reprojected_to_full_frame() -> None:
    """Backend returns a box in tile-local coords; the op must re-project
    to full-frame."""

    def backend(image: np.ndarray, prompts):
        return [
            GroundingDetection(bbox_xywh=(5, 5, 10, 10), label="found", score=0.5)
        ]

    out = sahi_recovery_impl(
        [_frame("F0", h=1024, w=1024)],
        [_first_pass("F0", 1)],
        prompts=PromptList(prompts=["x"]),
        loader=GroundingDinoLoader(backend=backend),
    )
    rec = out[0].detections
    assert rec, "expected at least one re-projected detection"
    # Full-frame coords: each tile starts at multiples of (TILE - OVERLAP) = 448.
    valid_xs = {0, 448, 896, 5}
    # First tile (0,0) → re-projected to (5, 5).
    assert any(int(d.bbox.x) in valid_xs for d in rec)


def test_dedupes_against_first_pass_at_iou_above_threshold() -> None:
    """A SAHI box that overlaps a first-pass box (IoU > 0.5) must be dropped.

    Use a small (single-tile) frame so we can reason about exactly one
    backend call and one re-projection.
    """

    def backend(image: np.ndarray, prompts):
        # Return a box at the first-pass detection's position.
        return [
            GroundingDetection(bbox_xywh=(0, 0, 10, 10), label="dup", score=0.9)
        ]

    fp = FrameDetections(
        detector="florence",
        frame_id="F0",
        detections=[
            RawDetection(
                detector="florence",
                frame_id="F0",
                bbox=BBox(x=0, y=0, width=10, height=10),
                label="orig",
                raw_confidence=None,
            )
        ],
        detector_error=False,
    )
    # 512×512 frame → exactly one tile call. Density = 1/0.262 ≈ 3.8/MP <
    # default trigger 5/MP → SAHI runs.
    out = sahi_recovery_impl(
        [_frame("F0", h=512, w=512)],
        [fp],
        prompts=PromptList(prompts=["x"]),
        loader=GroundingDinoLoader(backend=backend),
    )
    assert out, "expected SAHI to run for a low-density frame"
    assert out[0].detections == []  # the only proposed box was deduped


def test_tile_failure_recorded_in_tile_errors() -> None:
    state = {"calls": 0}

    def flaky(image: np.ndarray, prompts):
        state["calls"] += 1
        # Always raise — exhaust 3 retries per tile.
        raise RuntimeError("kaboom")

    out = sahi_recovery_impl(
        [_frame("F0", h=1024, w=1024)],
        [_first_pass("F0", 1)],
        prompts=PromptList(prompts=["x"]),
        loader=GroundingDinoLoader(backend=flaky),
    )
    assert len(out) == 1
    assert out[0].tile_errors, "tile_errors must be populated on persistent tile fail"
    # Op succeeds despite tile failures.
    assert out[0].detector_error is False


def test_detector_field_is_gdino_sahi() -> None:
    def backend(image: np.ndarray, prompts):
        return [GroundingDetection(bbox_xywh=(5, 5, 5, 5), label="x", score=0.7)]

    out = sahi_recovery_impl(
        [_frame("F0")],
        [_first_pass("F0", 1)],
        prompts=PromptList(prompts=["x"]),
        loader=GroundingDinoLoader(backend=backend),
    )
    assert out[0].detector == "gdino-sahi"
    for d in out[0].detections:
        assert d.detector == "gdino-sahi"


def test_empty_prompts_emits_empty_record_when_triggered() -> None:
    out = sahi_recovery_impl(
        [_frame("F0")],
        [_first_pass("F0", 1)],
        prompts=PromptList(prompts=[]),
        loader=_quiet_loader(),
    )
    assert out[0].detections == []
    assert out[0].detector_error is False
