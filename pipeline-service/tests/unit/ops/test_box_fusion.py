"""§3.8 box_fusion — WBF tests."""
from __future__ import annotations

from pipeline_service.ops.box_fusion import box_fusion_impl
from pipeline_service.types import (
    BBox,
    FrameDetections,
    PipelineConfig,
    RawDetection,
)


def _det(detector: str, frame_id: str, label: str, x: float, y: float, w: float = 30, h: float = 30, score: float | None = 0.7) -> RawDetection:
    return RawDetection(
        detector=detector,
        frame_id=frame_id,
        bbox=BBox(x=x, y=y, width=w, height=h),
        label=label,
        raw_confidence=score,
    )


def _frame_dets(detector: str, frame_id: str, dets: list[RawDetection]) -> FrameDetections:
    return FrameDetections(
        detector=detector,
        frame_id=frame_id,
        detections=dets,
        detector_error=False,
    )


def test_overlapping_boxes_fuse_into_one_cluster() -> None:
    inputs = [
        _frame_dets("florence", "F0", [_det("florence", "F0", "lamp", 0, 0, 30, 30)]),
        _frame_dets(
            "gdino",
            "F0",
            [_det("gdino", "F0", "lamp", 5, 5, 30, 30)],  # IoU ~0.5
        ),
    ]
    out = box_fusion_impl(inputs)
    assert len(out) == 1
    assert len(out[0].fused) == 1
    assert out[0].fused[0].primary_label == "lamp"


def test_non_overlapping_boxes_stay_separate() -> None:
    inputs = [
        _frame_dets("florence", "F0", [_det("florence", "F0", "lamp", 0, 0, 30, 30)]),
        _frame_dets("gdino", "F0", [_det("gdino", "F0", "chair", 100, 100, 30, 30)]),
    ]
    out = box_fusion_impl(inputs)
    assert len(out[0].fused) == 2


def test_detector_weights_pick_higher_weighted_label_as_primary() -> None:
    inputs = [
        _frame_dets("florence", "F0", [_det("florence", "F0", "F-lab", 0, 0, 30, 30, score=None)]),
        _frame_dets("gdino", "F0", [_det("gdino", "F0", "G-lab", 0, 0, 30, 30, score=0.9)]),
    ]
    out = box_fusion_impl(inputs)
    assert out[0].fused[0].primary_label == "G-lab"
    assert any(label == "F-lab" for label, _ in out[0].fused[0].alternates)


def test_florence_none_confidence_recorded_as_none_in_signals() -> None:
    inputs = [
        _frame_dets("florence", "F0", [_det("florence", "F0", "lamp", 0, 0, 30, 30, score=None)]),
    ]
    out = box_fusion_impl(inputs)
    sig = out[0].fused[0].contributing_signals[0]
    assert sig.detector == "florence"
    assert sig.rawConfidence is None


def test_contributing_signals_records_every_input() -> None:
    inputs = [
        _frame_dets("florence", "F0", [_det("florence", "F0", "lamp", 0, 0, 30, 30)]),
        _frame_dets("gdino", "F0", [_det("gdino", "F0", "lamp", 5, 5, 30, 30)]),
        _frame_dets("gdino-sahi", "F0", [_det("gdino-sahi", "F0", "lamp", 8, 8, 30, 30)]),
    ]
    out = box_fusion_impl(inputs)
    detectors = sorted(s.detector for s in out[0].fused[0].contributing_signals)
    assert detectors == ["florence", "gdino", "gdino-sahi"]


def test_deterministic_byte_equal_under_input_reordering() -> None:
    inputs_a = [
        _frame_dets("florence", "F0", [_det("florence", "F0", "lamp", 0, 0, 30, 30)]),
        _frame_dets("gdino", "F0", [_det("gdino", "F0", "lamp", 5, 5, 30, 30)]),
    ]
    inputs_b = list(reversed(inputs_a))
    out_a = box_fusion_impl(inputs_a)
    out_b = box_fusion_impl(inputs_b)
    # IDs must be byte-equal.
    ids_a = [d.detection_id for f in out_a for d in f.fused]
    ids_b = [d.detection_id for f in out_b for d in f.fused]
    assert ids_a == ids_b


def test_empty_input_returns_empty_list() -> None:
    assert box_fusion_impl([]) == []


def test_empty_per_frame_detections_emits_empty_fused_frame() -> None:
    inputs = [
        FrameDetections(detector="florence", frame_id="F0", detections=[]),
    ]
    out = box_fusion_impl(inputs)
    assert len(out) == 1
    assert out[0].frame_id == "F0"
    assert out[0].fused == []


def test_alternates_carry_suppressed_labels() -> None:
    inputs = [
        _frame_dets("florence", "F0", [_det("florence", "F0", "lamp", 0, 0, 30, 30)]),
        _frame_dets("gdino", "F0", [_det("gdino", "F0", "light", 5, 5, 30, 30)]),
    ]
    out = box_fusion_impl(inputs)
    fd = out[0].fused[0]
    alt_labels = {a[0] for a in fd.alternates}
    # Either "lamp" or "light" wins primary; the other is in alternates.
    assert "lamp" in alt_labels or "light" in alt_labels
