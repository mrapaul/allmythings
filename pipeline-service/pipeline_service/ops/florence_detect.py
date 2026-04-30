"""§3.4 florence_detect — REAL op (replaces section-01 stub).

Calls the existing detection-service Florence-2 HTTP server per frame.
Each frame retries up to 3× on 5xx; per-frame final failure becomes
``FrameDetections(detector_error=True, detections=[])`` and the op
continues for other frames.

4xx is treated as deterministic — no retry, single attempt.

Determinism: emitted ``RawDetection`` list per frame is sorted by
``(label, x, y)`` so byte-equal output across runs given the same
Florence response.
"""
from __future__ import annotations

import logging
from typing import Iterable

from pipeline_service.models.florence_client import (
    FlorenceClient,
    FlorenceClientError,
    FlorenceServerError,
    FlorenceTimeout,
)
from pipeline_service.types import (
    BBox,
    Frame,
    FrameDetections,
    RawDetection,
)

logger = logging.getLogger("pipeline_service.ops.florence_detect")

_MAX_RETRIES = 3


def _detector_error_response(frame_id: str) -> FrameDetections:
    return FrameDetections(
        detector="florence",
        frame_id=frame_id,
        detections=[],
        detector_error=True,
    )


async def _detect_one(
    client: FlorenceClient,
    frame: Frame,
) -> FrameDetections:
    payload = None
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            payload = await client.detect(
                frame_bytes=_frame_bytes(frame),
                mime_type="image/jpeg",
            )
            break
        except (FlorenceServerError, FlorenceTimeout) as exc:
            logger.warning(
                "florence retryable error attempt %d/%d for %s: %s",
                attempt,
                _MAX_RETRIES,
                frame.frame_id,
                exc,
            )
            if attempt == _MAX_RETRIES:
                return _detector_error_response(frame.frame_id)
        except FlorenceClientError as exc:
            # 4xx is deterministic; do not retry.
            logger.warning("florence 4xx for %s: %s", frame.frame_id, exc)
            return _detector_error_response(frame.frame_id)

    if payload is None:  # defensive; loop above either breaks or returns
        return _detector_error_response(frame.frame_id)

    raw_regions = payload.get("regions", []) if isinstance(payload, dict) else []
    detections: list[RawDetection] = []
    for region in raw_regions:
        try:
            det = RawDetection(
                detector="florence",
                frame_id=frame.frame_id,
                bbox=BBox(
                    x=float(region.get("x", 0.0)),
                    y=float(region.get("y", 0.0)),
                    width=float(region.get("width", 0.0)),
                    height=float(region.get("height", 0.0)),
                ),
                label=str(region.get("caption", "")).strip(),
                raw_confidence=None,
            )
        except (TypeError, ValueError) as exc:
            logger.warning("malformed Florence region in %s: %s", frame.frame_id, exc)
            continue
        if not det.label:
            continue
        detections.append(det)

    detections.sort(key=lambda d: (d.label, d.bbox.x, d.bbox.y))
    return FrameDetections(
        detector="florence",
        frame_id=frame.frame_id,
        detections=detections,
        detector_error=False,
    )


def _frame_bytes(frame: Frame) -> bytes:
    """Return the bytes that get POST'd to Florence.

    For section-03 we serialise the in-memory RGB array as JPEG via Pillow's
    fast path. Frame's ``rgb_bytes`` holds the raw decoded pixels (from
    frame_intake); we re-encode here so the server receives a real image.
    """
    from io import BytesIO

    from PIL import Image
    import numpy as np

    if frame.decoding_failed or not frame.rgb_bytes:
        # Send a 1x1 black pixel so the request shape is valid; the server
        # will return zero regions and the op carries on.
        buf = BytesIO()
        Image.new("RGB", (1, 1)).save(buf, format="JPEG")
        return buf.getvalue()
    arr = np.frombuffer(frame.rgb_bytes, dtype=frame.rgb_dtype).reshape(frame.rgb_shape)
    img = Image.fromarray(arr)
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


async def florence_detect_impl(
    frames: Iterable[Frame],
    *,
    client: FlorenceClient | None = None,
) -> list[FrameDetections]:
    """See plan §3.4. Per-frame Florence call with retry; per-frame failure
    becomes ``detector_error=True``; op continues for other frames.

    Empty input → empty output.
    """
    sorted_frames = sorted(list(frames), key=lambda f: f.frame_id)
    if not sorted_frames:
        return []
    flo = client or FlorenceClient()
    out: list[FrameDetections] = []
    for frame in sorted_frames:
        out.append(await _detect_one(flo, frame))
    return out
