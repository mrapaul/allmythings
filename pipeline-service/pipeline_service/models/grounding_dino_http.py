"""HTTP-backed GroundingBackend talking to detection-service.

Mirror of FlorenceClient — the real Grounding DINO model lives in
detection-service (which has torch + transformers + mps). This client
posts a frame + prompt list and converts the response into the
``GroundingDetection`` shape the op expects.

Pipeline-service stays torch-free.
"""
from __future__ import annotations

import io
import json
import logging
from typing import Sequence

import httpx
import numpy as np
from PIL import Image

from pipeline_service.models.grounding_dino import GroundingDetection

logger = logging.getLogger("pipeline_service.models.grounding_dino_http")


class GroundingDinoHttpError(Exception):
    """Backend HTTP failure — caller decides retry vs surface."""


def _image_to_jpeg_bytes(image: np.ndarray) -> bytes:
    pil = Image.fromarray(image.astype(np.uint8))
    buf = io.BytesIO()
    pil.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


class HttpGroundingDinoBackend:
    """Drop-in for ``GroundingBackend`` callable interface."""

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:14001",
        *,
        timeout_s: float = 30.0,
        # Defaults match IDEA-Research/grounding-dino-tiny README:
        # 0.40 / 0.30 for box / text. The previous 0.30 / 0.25 values
        # produced hallucinated detections — Grounding DINO is open-
        # vocabulary and will land on borderline-confidence boxes for
        # any prompt it's asked to find.
        box_threshold: float = 0.40,
        text_threshold: float = 0.30,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_s = timeout_s
        self.box_threshold = box_threshold
        self.text_threshold = text_threshold

    def __call__(
        self,
        image: np.ndarray,
        prompts: Sequence[str],
    ) -> list[GroundingDetection]:
        if not prompts:
            return []
        if image.size == 0:
            return []
        h, w = image.shape[:2]
        jpeg_bytes = _image_to_jpeg_bytes(image)
        try:
            with httpx.Client(timeout=self.timeout_s) as client:
                resp = client.post(
                    f"{self.base_url}/detect/grounding_dino",
                    files={"file": ("frame.jpg", jpeg_bytes, "image/jpeg")},
                    data={
                        "prompts_json": json.dumps(list(prompts)),
                        "box_threshold": str(self.box_threshold),
                        "text_threshold": str(self.text_threshold),
                    },
                )
        except httpx.HTTPError as exc:
            raise GroundingDinoHttpError(f"transport error: {exc}") from exc
        if resp.status_code >= 500:
            raise GroundingDinoHttpError(
                f"backend {resp.status_code}: {resp.text[:200]}"
            )
        if resp.status_code >= 400:
            # Deterministic 4xx — log + return empty rather than retry forever.
            logger.warning(
                "grounding_dino backend rejected request: %s %s",
                resp.status_code,
                resp.text[:200],
            )
            return []
        payload = resp.json()
        boxes = payload.get("boxes", [])
        out: list[GroundingDetection] = []
        for b in boxes:
            # Backend returns normalised coords; op expects pixel space.
            label = str(b.get("label", "")).strip()
            if not label:
                continue
            x = float(b.get("x", 0.0)) * w
            y = float(b.get("y", 0.0)) * h
            bw = float(b.get("width", 0.0)) * w
            bh = float(b.get("height", 0.0)) * h
            out.append(
                GroundingDetection(
                    bbox_xywh=(x, y, bw, bh),
                    label=label,
                    score=float(b.get("score", 0.0)),
                )
            )
        return out
