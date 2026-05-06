"""Tests for the EVAL_MOCK_BACKENDS short-circuit.

Asserts that flipping the env var causes florence_detect and
grounding_dino_detect to emit deterministic synthetic FrameDetections
without instantiating their real clients/loaders. This is what makes
``make eval`` runnable in CI without GPU model HTTP servers.
"""
from __future__ import annotations

import asyncio
import os
from contextlib import contextmanager

import pytest

from pipeline_service.ops.florence_detect import florence_detect_impl
from pipeline_service.ops.grounding_dino_detect import grounding_dino_detect_impl
from pipeline_service.ops._synthetic import is_mock_mode, synthetic_frame_detections
from pipeline_service.types import Frame


@contextmanager
def mock_mode_on():
    prev = os.environ.get("EVAL_MOCK_BACKENDS")
    os.environ["EVAL_MOCK_BACKENDS"] = "1"
    try:
        yield
    finally:
        if prev is None:
            os.environ.pop("EVAL_MOCK_BACKENDS", None)
        else:
            os.environ["EVAL_MOCK_BACKENDS"] = prev


def _frame(fid: str = "F0") -> Frame:
    return Frame(
        frame_id=fid,
        sha256="x" * 64,
        mime_type="image/jpeg",
        rgb_bytes=b"",
        rgb_shape=(1, 1, 3),
        rgb_dtype="uint8",
        decoding_failed=False,
    )


def test_is_mock_mode_reads_env():
    assert not is_mock_mode()
    with mock_mode_on():
        assert is_mock_mode()
    assert not is_mock_mode()


def test_synthetic_frame_detections_deterministic():
    f0, f1 = _frame("F0"), _frame("F1")
    a = synthetic_frame_detections("florence", [f0, f1])
    b = synthetic_frame_detections("florence", [f1, f0])  # input order varied
    assert [(fd.frame_id, [d.label for d in fd.detections]) for fd in a] == [
        (fd.frame_id, [d.label for d in fd.detections]) for fd in b
    ]
    # Three synthetic labels per frame, sorted.
    assert all(len(fd.detections) == 3 for fd in a)
    assert [d.label for d in a[0].detections] == sorted(d.label for d in a[0].detections)


def test_synthetic_florence_and_gdino_agree_on_labels():
    """Cross-detector agreement is the eval gate (≥0.70). Synthetic
    outputs must use the same label namespace so the gate is reachable."""
    f0 = _frame("F0")
    flo = synthetic_frame_detections("florence", [f0])
    gd = synthetic_frame_detections("gdino", [f0])
    flo_labels = {d.label for d in flo[0].detections}
    gd_labels = {d.label for d in gd[0].detections}
    assert flo_labels == gd_labels


def test_florence_impl_short_circuits_in_mock_mode():
    """florence_detect_impl must NOT instantiate FlorenceClient in mock mode."""
    f0 = _frame("F0")
    with mock_mode_on():
        result = asyncio.run(florence_detect_impl([f0], client=None))
    assert len(result) == 1
    assert result[0].detector == "florence"
    assert not result[0].detector_error
    assert len(result[0].detections) > 0
    assert all(d.label.startswith("synthetic_") for d in result[0].detections)


def test_gdino_impl_short_circuits_in_mock_mode():
    """grounding_dino_detect_impl must NOT instantiate GroundingDinoLoader."""
    f0 = _frame("F0")
    with mock_mode_on():
        result = grounding_dino_detect_impl([f0], prompts=["chair"])
    assert len(result) == 1
    assert result[0].detector == "gdino"
    assert not result[0].detector_error
    assert all(d.label.startswith("synthetic_") for d in result[0].detections)
    assert all(d.raw_confidence is not None for d in result[0].detections)


def test_explicit_client_overrides_mock_mode():
    """If a caller injects a real client, mock mode does NOT apply.
    This protects production from accidentally serving synthetic data."""
    from pipeline_service.models.florence_client import FlorenceClient

    class DummyClient(FlorenceClient):
        def __init__(self) -> None:
            pass  # skip real init

        async def detect(self, *, frame_bytes: bytes, mime_type: str) -> dict:
            return {"regions": []}

    f0 = _frame("F0")
    with mock_mode_on():
        result = asyncio.run(florence_detect_impl([f0], client=DummyClient()))
    # Real client returned no regions → empty detections, NOT synthetic.
    assert len(result) == 1
    assert result[0].detections == []
