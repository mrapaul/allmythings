"""§3.7 effsam_segment — real-op unit tests."""
from __future__ import annotations

from datetime import datetime, timezone

import numpy as np

from pipeline_service.models.effsam import EffSAMLoader
from pipeline_service.ops.effsam_segment import effsam_segment_impl
from pipeline_service.types import (
    BBox,
    ContributingSignal,
    Frame,
    FusedDetection,
    FusedFrame,
)


def _frame(frame_id: str = "F0", h: int = 100, w: int = 100) -> Frame:
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


def _det(det_id: str, x: float = 10, y: float = 10, w: float = 30, h: float = 30) -> FusedDetection:
    return FusedDetection(
        detection_id=det_id,
        frame_id="F0",
        bbox=BBox(x=x, y=y, width=w, height=h),
        primary_label="lamp",
        contributing_signals=[
            ContributingSignal(detector="florence", frameId="F0", rawConfidence=None)
        ],
    )


def test_emits_mask_per_box_on_happy_path() -> None:
    fused = FusedFrame(frame_id="F0", fused=[_det("d1"), _det("d2", x=50, y=50)])
    out = effsam_segment_impl([_frame()], [fused])
    assert len(out) == 2
    assert {m.detection_id for m in out} == {"d1", "d2"}
    assert all(m.frame_id == "F0" for m in out)
    assert all(len(m.rle_bytes) > 0 for m in out)


def test_low_iou_mask_is_dropped() -> None:
    """Backend returns a mask that doesn't overlap with the bbox at all
    → IoU 0 < 0.4 threshold → dropped."""

    def backend(image, bboxes):
        # Mask of zeros — IoU with any bbox is 0.
        return [np.zeros(image.shape[:2], dtype=np.uint8) for _ in bboxes]

    fused = FusedFrame(frame_id="F0", fused=[_det("d1")])
    out = effsam_segment_impl(
        [_frame()], [fused], loader=EffSAMLoader(backend=backend)
    )
    assert out == []


def test_effsam_unavailable_op_succeeds_empty() -> None:
    def boom(image, bboxes):
        raise RuntimeError("effsam unavailable")

    fused = FusedFrame(frame_id="F0", fused=[_det("d1")])
    out = effsam_segment_impl(
        [_frame()], [fused], loader=EffSAMLoader(backend=boom)
    )
    assert out == []  # op succeeds, no masks


def test_per_box_failure_via_backend_filtering() -> None:
    """Backend returns one good mask + one zero mask for two bboxes;
    the zero-mask one is dropped, the good one stays."""

    def backend(image, bboxes):
        h, w = image.shape[:2]
        out = []
        for x, y, bw, bh in bboxes:
            if bw < 20:
                # too-small bbox → return zeros (low IoU drop)
                out.append(np.zeros((h, w), dtype=np.uint8))
            else:
                m = np.zeros((h, w), dtype=np.uint8)
                m[int(y) : int(y + bh), int(x) : int(x + bw)] = 1
                out.append(m)
        return out

    fused = FusedFrame(
        frame_id="F0",
        fused=[
            _det("ok", x=10, y=10, w=30, h=30),
            _det("bad", x=10, y=10, w=5, h=5),
        ],
    )
    out = effsam_segment_impl(
        [_frame()], [fused], loader=EffSAMLoader(backend=backend)
    )
    ids = {m.detection_id for m in out}
    assert ids == {"ok"}


def test_empty_fused_frame_no_output() -> None:
    out = effsam_segment_impl(
        [_frame()],
        [FusedFrame(frame_id="F0", fused=[])],
    )
    assert out == []
