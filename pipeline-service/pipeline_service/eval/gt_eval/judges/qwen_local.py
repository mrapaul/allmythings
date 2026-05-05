"""Qwen-VL local judge backed by the existing async ``OllamaClient``.

The judge is the v1 concrete impl of ``ReferenceModelJudge``. It takes
JPEG bytes, expands the crop by ``roi_pad_frac`` (default 0.5 → 1.5×),
and asks Qwen-VL via Ollama JSON-mode whether the region depicts the
claimed label. Any transport, parse, or shape failure is swallowed and
returned as ``"unsure"`` — the metric module's null-out logic is the
sole consumer of that signal.
"""
from __future__ import annotations

import io
import json
import logging
from typing import Any, Optional

from PIL import Image

from pipeline_service.eval.gt_eval.judges.protocol import (
    JudgeVerdict,
    ReferenceModelJudge,  # noqa: F401  (re-export for typing convenience)
)
from pipeline_service.models.ollama_client import OllamaClient

logger = logging.getLogger(__name__)


PROMPT_TEMPLATE = (
    "You are verifying a vision-model detection. Look at the cropped region.\n"
    "Is this region a {label}? Answer with JSON only:\n"
    '  {{"verdict": "yes"}} if confident the region shows a {label},\n'
    '  {{"verdict": "no"}} if it clearly is not,\n'
    '  {{"verdict": "unsure"}} if you cannot tell.\n'
    "Do not include any other keys or commentary."
)


_VALID_VERDICTS: set[str] = {"yes", "no", "unsure"}


class QwenLocalJudge:
    """Qwen-2.5-VL 3B judge via local Ollama."""

    name: str = "qwen2.5vl:3b"

    def __init__(
        self,
        client: Optional[OllamaClient] = None,
        *,
        roi_pad_frac: float = 0.5,
        keep_alive: str = "60s",
        model: str = "qwen2.5vl:3b",
    ) -> None:
        self.client = client if client is not None else OllamaClient()
        self.roi_pad_frac = float(roi_pad_frac)
        self.keep_alive = keep_alive
        self.model = model

    @staticmethod
    def _expand_crop(jpeg_bytes: bytes, pad_frac: float) -> bytes:
        """Resize JPEG bytes by ``(1 + pad_frac)`` on each side via LANCZOS.

        Falls back to the original bytes on decode failure (test stubs
        with non-JPEG payloads must not crash the judge).
        """
        try:
            with Image.open(io.BytesIO(jpeg_bytes)) as img:
                img.load()
                w, h = img.size
                new_w = int(round(w * (1.0 + pad_frac)))
                new_h = int(round(h * (1.0 + pad_frac)))
                if new_w <= 0 or new_h <= 0:
                    return jpeg_bytes
                resample = getattr(
                    Image, "Resampling", Image
                ).LANCZOS  # Pillow 10+ exposes via Image.Resampling
                resized = img.convert("RGB").resize((new_w, new_h), resample)
                buf = io.BytesIO()
                resized.save(buf, format="JPEG", quality=92)
                return buf.getvalue()
        except (OSError, ValueError) as exc:
            logger.debug(
                "QwenLocalJudge: crop expansion fell back to raw bytes (%s)", exc
            )
            return jpeg_bytes

    @staticmethod
    def _parse_verdict(raw: Any) -> JudgeVerdict:
        """Coerce an Ollama-shaped payload into a JudgeVerdict."""
        try:
            payload: Any
            if isinstance(raw, dict) and "verdict" in raw:
                payload = raw
            elif isinstance(raw, dict) and "response" in raw:
                response = raw["response"]
                if isinstance(response, dict):
                    payload = response
                else:
                    payload = json.loads(str(response))
            elif isinstance(raw, str):
                payload = json.loads(raw)
            else:
                return "unsure"
            verdict = payload.get("verdict") if isinstance(payload, dict) else None
        except (json.JSONDecodeError, TypeError, ValueError) as exc:
            logger.warning(
                "QwenLocalJudge: verdict parse failure (%s); raw=%r",
                exc,
                str(raw)[:200],
            )
            return "unsure"
        if verdict in _VALID_VERDICTS:
            return verdict  # type: ignore[return-value]
        return "unsure"

    async def verify(
        self, crop_jpeg_bytes: bytes, label: str
    ) -> JudgeVerdict:
        expanded = self._expand_crop(crop_jpeg_bytes, self.roi_pad_frac)
        prompt = PROMPT_TEMPLATE.format(label=label)
        logger.info(
            "QwenLocalJudge.verify: label=%r crop_size_bytes=%d",
            label,
            len(expanded),
        )
        try:
            raw = await self.client.generate(
                model=self.model,
                prompt=prompt,
                images=[expanded],
                format="json",
                keep_alive=self.keep_alive,
            )
        except Exception as exc:  # noqa: BLE001 — uniform-degradation contract
            logger.warning(
                "QwenLocalJudge: transport failure (%s) for label=%r; -> unsure",
                type(exc).__name__,
                label,
            )
            return "unsure"
        return self._parse_verdict(raw)
