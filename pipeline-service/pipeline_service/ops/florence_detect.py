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
    # Florence returns normalised [0,1] bbox coordinates; gdino + sahi
    # downstream expect pixel-space coordinates so cross-pass dedup
    # (IoU-based) can compare them. Multiply by the *served* image
    # dimensions returned alongside the regions — this matches the W/H
    # the model actually saw, which may differ from frame.rgb_shape if
    # the encoder resized.
    served_w = float(payload.get("image_width") or 0.0) if isinstance(payload, dict) else 0.0
    served_h = float(payload.get("image_height") or 0.0) if isinstance(payload, dict) else 0.0
    if served_w <= 0 or served_h <= 0:
        # Fall back to the frame's own decoded dims.
        try:
            served_h, served_w = float(frame.rgb_shape[0]), float(frame.rgb_shape[1])
        except (IndexError, TypeError):
            served_w = served_h = 0.0
    detections: list[RawDetection] = []
    for region in raw_regions:
        try:
            x_norm = float(region.get("x", 0.0))
            y_norm = float(region.get("y", 0.0))
            w_norm = float(region.get("width", 0.0))
            h_norm = float(region.get("height", 0.0))
            det = RawDetection(
                detector="florence",
                frame_id=frame.frame_id,
                bbox=BBox(
                    x=x_norm * served_w,
                    y=y_norm * served_h,
                    width=w_norm * served_w,
                    height=h_norm * served_h,
                ),
                label=str(region.get("caption", "")).strip(),
                raw_confidence=None,
            )
        except (TypeError, ValueError) as exc:
            logger.warning("malformed Florence region in %s: %s", frame.frame_id, exc)
            continue
        if not det.label:
            continue
        # Florence-2's dense-region head sometimes emits scene-caption
        # regions (verbose labels like "living room with X and Y") whose
        # bbox spans the full frame on one axis with substantial area on
        # the other. These poison downstream classification (Qwen-VL just
        # sees the whole scene again). Drop when one axis is ≥95% AND the
        # combined normalised area is ≥30% — that pairing catches scene
        # strips while preserving thin-but-tall/wide legitimate objects
        # (a vertical lamp at 0.05×0.95 has area ~0.05, kept).
        if (w_norm >= 0.95 or h_norm >= 0.95) and (w_norm * h_norm) >= 0.30:
            logger.info(
                "dropping scene-caption Florence region in %s "
                "(w=%.3f h=%.3f area=%.3f label=%r)",
                frame.frame_id,
                w_norm,
                h_norm,
                w_norm * h_norm,
                det.label,
            )
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

    When ``EVAL_MOCK_BACKENDS=1`` is set in the environment AND no
    explicit ``client`` was provided, emit deterministic synthetic
    detections so CI / eval can run without a real Florence backend.
    """
    sorted_frames = sorted(list(frames), key=lambda f: f.frame_id)
    if not sorted_frames:
        return []
    from pipeline_service.ops._synthetic import is_mock_mode, synthetic_frame_detections
    if client is None and is_mock_mode():
        return synthetic_frame_detections("florence", sorted_frames)
    flo = client or FlorenceClient()
    out: list[FrameDetections] = []
    for frame in sorted_frames:
        out.append(await _detect_one(flo, frame))
    return out
