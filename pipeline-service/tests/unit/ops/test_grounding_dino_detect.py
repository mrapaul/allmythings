"""§3.5 grounding_dino_detect — real-op unit tests."""
from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
import pytest

from pipeline_service.models.grounding_dino import (
    GroundingDetection,
    GroundingDinoLoader,
)
from pipeline_service.ops.grounding_dino_detect import grounding_dino_detect_impl
from pipeline_service.types import Frame, PipelineConfig, PromptList


def _frame(frame_id: str = "F0") -> Frame:
    arr = np.full((400, 400, 3), 100, dtype=np.uint8)
    return Frame(
        frame_id=frame_id,
        rgb_bytes=arr.tobytes(),
        rgb_shape=(400, 400, 3),
        rgb_dtype="uint8",
        exif_orientation=1,
        captured_at=datetime.now(timezone.utc),
        decoding_failed=False,
    )


def _loader_with(*detections: GroundingDetection) -> GroundingDinoLoader:
    captured: list[GroundingDetection] = list(detections)

    def backend(image: np.ndarray, prompts):
        return list(captured)

    return GroundingDinoLoader(backend=backend)


def test_filters_below_score_threshold() -> None:
    loader = _loader_with(
        GroundingDetection(bbox_xywh=(10, 10, 20, 20), label="lamp", score=0.10),
        GroundingDetection(bbox_xywh=(30, 30, 20, 20), label="chair", score=0.50),
    )
    out = grounding_dino_detect_impl(
        [_frame()], PromptList(prompts=["lamp", "chair"]), loader=loader,
        config=PipelineConfig(),
    )
    labels = [d.label for d in out[0].detections]
    assert "chair" in labels
    assert "lamp" not in labels


def test_raw_confidence_carries_model_score() -> None:
    loader = _loader_with(
        GroundingDetection(bbox_xywh=(0, 0, 10, 10), label="x", score=0.85)
    )
    out = grounding_dino_detect_impl(
        [_frame()], PromptList(prompts=["x"]), loader=loader,
    )
    assert out[0].detections[0].raw_confidence == pytest.approx(0.85)


def test_per_frame_retry_then_success() -> None:
    calls = {"n": 0}

    def flaky(image: np.ndarray, prompts):
        calls["n"] += 1
        if calls["n"] < 3:
            raise RuntimeError("transient")
        return [GroundingDetection(bbox_xywh=(0, 0, 5, 5), label="ok", score=0.5)]

    loader = GroundingDinoLoader(backend=flaky)
    out = grounding_dino_detect_impl(
        [_frame()], PromptList(prompts=["ok"]), loader=loader,
    )
    assert out[0].detector_error is False
    assert calls["n"] == 3


def test_per_frame_persistent_failure_emits_detector_error() -> None:
    def always_fail(image: np.ndarray, prompts):
        raise RuntimeError("nope")

    loader = GroundingDinoLoader(backend=always_fail)
    out = grounding_dino_detect_impl(
        [_frame("F0"), _frame("F1")],
        PromptList(prompts=["x"]),
        loader=loader,
    )
    for fd in out:
        assert fd.detector_error is True
        assert fd.detections == []


def test_detector_field_is_gdino() -> None:
    loader = _loader_with(
        GroundingDetection(bbox_xywh=(0, 0, 5, 5), label="x", score=0.5)
    )
    out = grounding_dino_detect_impl(
        [_frame()], PromptList(prompts=["x"]), loader=loader,
    )
    for d in out[0].detections:
        assert d.detector == "gdino"
    assert out[0].detector == "gdino"


def test_empty_prompt_list_emits_empty_no_error() -> None:
    loader = _loader_with()
    out = grounding_dino_detect_impl(
        [_frame()], PromptList(prompts=[]), loader=loader,
    )
    assert out[0].detections == []
    assert out[0].detector_error is False


def test_deterministic_ordering() -> None:
    loader = _loader_with(
        GroundingDetection(bbox_xywh=(50, 50, 5, 5), label="lamp", score=0.5),
        GroundingDetection(bbox_xywh=(10, 10, 5, 5), label="chair", score=0.5),
    )
    out_a = grounding_dino_detect_impl(
        [_frame()], PromptList(prompts=["x"]), loader=loader,
    )
    labels_a = [d.label for d in out_a[0].detections]
    assert labels_a == sorted(labels_a)
