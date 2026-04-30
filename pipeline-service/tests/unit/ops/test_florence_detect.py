"""§3.4 florence_detect — real op replaces the section-01 stub."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pytest

from pipeline_service.ops.florence_detect import florence_detect_impl
from pipeline_service.types import Frame


def _frame(frame_id: str = "F0") -> Frame:
    # Minimal RGB Frame; rgb content irrelevant to florence_detect (it sends
    # bytes from disk, but the op accepts a Frame object whose rgb_bytes is
    # the encoded payload tracked by the op's contract).
    return Frame(
        frame_id=frame_id,
        rgb_bytes=b"\x00" * 12,
        rgb_shape=(2, 2, 3),
        exif_orientation=1,
        captured_at=datetime.now(timezone.utc),
        decoding_failed=False,
    )


def _flo(regions: list[dict[str, Any]]) -> dict[str, Any]:
    return {"regions": regions, "image_width": 100, "image_height": 100}


@pytest.fixture
def httpx_mock_strict(httpx_mock):
    httpx_mock.non_mocked_hosts = []
    return httpx_mock


@pytest.mark.asyncio
async def test_emits_raw_detection_with_none_confidence(httpx_mock_strict) -> None:
    httpx_mock_strict.add_response(
        method="POST",
        url="http://127.0.0.1:14001/detect/florence",
        json=_flo([{"caption": "lamp", "x": 1.0, "y": 2.0, "width": 10.0, "height": 11.0}]),
    )
    out = await florence_detect_impl([_frame("F0")])
    assert len(out) == 1
    fd = out[0]
    assert fd.detector == "florence"
    assert fd.detector_error is False
    assert len(fd.detections) == 1
    det = fd.detections[0]
    assert det.label == "lamp"
    assert det.raw_confidence is None
    assert det.detector == "florence"


@pytest.mark.asyncio
async def test_per_frame_partial_failure(httpx_mock_strict) -> None:
    """One frame's HTTP fails persistently; the op succeeds for the other frame."""
    # First frame: 3× 503 → final fail.
    for _ in range(3):
        httpx_mock_strict.add_response(
            method="POST",
            url="http://127.0.0.1:14001/detect/florence",
            status_code=503,
        )
    # Second frame: 200 happy.
    httpx_mock_strict.add_response(
        method="POST",
        url="http://127.0.0.1:14001/detect/florence",
        json=_flo([{"caption": "chair", "x": 0, "y": 0, "width": 1, "height": 1}]),
    )
    out = await florence_detect_impl([_frame("F0"), _frame("F1")])
    by_id = {fd.frame_id: fd for fd in out}
    assert by_id["F0"].detector_error is True
    assert by_id["F0"].detections == []
    assert by_id["F1"].detector_error is False
    assert len(by_id["F1"].detections) == 1


@pytest.mark.asyncio
async def test_5xx_retries_three_times_then_emits_detector_error(httpx_mock_strict) -> None:
    for _ in range(3):
        httpx_mock_strict.add_response(
            method="POST",
            url="http://127.0.0.1:14001/detect/florence",
            status_code=502,
        )
    out = await florence_detect_impl([_frame("F0")])
    assert out[0].detector_error is True
    assert out[0].detections == []


@pytest.mark.asyncio
async def test_5xx_then_success_on_retry(httpx_mock_strict) -> None:
    httpx_mock_strict.add_response(
        method="POST", url="http://127.0.0.1:14001/detect/florence", status_code=502
    )
    httpx_mock_strict.add_response(
        method="POST",
        url="http://127.0.0.1:14001/detect/florence",
        json=_flo([{"caption": "vase", "x": 0, "y": 0, "width": 1, "height": 1}]),
    )
    out = await florence_detect_impl([_frame("F0")])
    assert out[0].detector_error is False
    assert out[0].detections[0].label == "vase"


@pytest.mark.asyncio
async def test_empty_regions_is_well_typed(httpx_mock_strict) -> None:
    httpx_mock_strict.add_response(
        method="POST", url="http://127.0.0.1:14001/detect/florence", json=_flo([])
    )
    out = await florence_detect_impl([_frame("F0")])
    assert out[0].detections == []
    assert out[0].detector_error is False


@pytest.mark.asyncio
async def test_caption_maps_to_label_lowercased_via_florence_emission(
    httpx_mock_strict,
) -> None:
    """Florence-2 returns captions; we keep them as emitted (no normalisation
    here — section-04 prompt expansion handles that)."""
    httpx_mock_strict.add_response(
        method="POST",
        url="http://127.0.0.1:14001/detect/florence",
        json=_flo([{"caption": "Brass Desk Lamp", "x": 1, "y": 2, "width": 3, "height": 4}]),
    )
    out = await florence_detect_impl([_frame("F0")])
    assert out[0].detections[0].label == "Brass Desk Lamp"


@pytest.mark.asyncio
async def test_deterministic_ordering_by_label_x_y(httpx_mock_strict) -> None:
    """Sorted (label, x, y) before emit so byte-equal under any Florence
    response order."""
    regions_a = _flo([
        {"caption": "lamp", "x": 5, "y": 5, "width": 1, "height": 1},
        {"caption": "chair", "x": 1, "y": 1, "width": 1, "height": 1},
    ])
    regions_b = _flo([
        {"caption": "chair", "x": 1, "y": 1, "width": 1, "height": 1},
        {"caption": "lamp", "x": 5, "y": 5, "width": 1, "height": 1},
    ])
    httpx_mock_strict.add_response(
        method="POST", url="http://127.0.0.1:14001/detect/florence", json=regions_a
    )
    httpx_mock_strict.add_response(
        method="POST", url="http://127.0.0.1:14001/detect/florence", json=regions_b
    )
    out_a = (await florence_detect_impl([_frame("F0")]))[0]
    out_b = (await florence_detect_impl([_frame("F0")]))[0]
    labels_a = [d.label for d in out_a.detections]
    labels_b = [d.label for d in out_b.detections]
    assert labels_a == labels_b == ["chair", "lamp"]


@pytest.mark.asyncio
async def test_detector_field_is_florence(httpx_mock_strict) -> None:
    httpx_mock_strict.add_response(
        method="POST",
        url="http://127.0.0.1:14001/detect/florence",
        json=_flo([{"caption": "x", "x": 0, "y": 0, "width": 1, "height": 1}]),
    )
    out = await florence_detect_impl([_frame("F0")])
    for det in out[0].detections:
        assert det.detector == "florence"


@pytest.mark.asyncio
async def test_4xx_does_not_retry(httpx_mock_strict) -> None:
    """4xx is a deterministic client error — don't burn retry budget on it."""
    httpx_mock_strict.add_response(
        method="POST", url="http://127.0.0.1:14001/detect/florence", status_code=400
    )
    out = await florence_detect_impl([_frame("F0")])
    assert out[0].detector_error is True
    # Only one HTTP call should have happened.
    assert len(httpx_mock_strict.get_requests()) == 1
