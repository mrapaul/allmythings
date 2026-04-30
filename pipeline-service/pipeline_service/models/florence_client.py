"""Async HTTP client for the existing detection-service Florence-2 server.

§3.4 of claude-plan.md: thin client. Multipart upload of frame bytes,
returns the regions[] array unmodified for the op to normalise.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import httpx

logger = logging.getLogger("pipeline_service.models.florence_client")


@dataclass
class FlorenceRegion:
    caption: str
    x: float
    y: float
    width: float
    height: float


class FlorenceError(Exception):
    """Base class for Florence client failures."""


class FlorenceServerError(FlorenceError):
    """5xx — retryable by caller."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(f"Florence returned {status}: {message[:200]}")
        self.status = status


class FlorenceClientError(FlorenceError):
    """4xx — deterministic, not retryable."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(f"Florence returned {status}: {message[:200]}")
        self.status = status


class FlorenceTimeout(FlorenceError, TimeoutError):
    pass


class FlorenceClient:
    """HTTP client to the existing detection-service Florence-2 server."""

    name = "florence_client"

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:14001",
        *,
        default_timeout_s: float = 30.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._default_timeout_s = default_timeout_s

    async def warmup(self) -> None:  # pragma: no cover
        return None

    async def detect(
        self,
        *,
        frame_bytes: bytes,
        mime_type: str,
        timeout_s: Optional[float] = None,
    ) -> dict:
        """POST {base_url}/detect/florence as multipart.

        Returns the JSON response unmodified. Raises:
          - FlorenceTimeout on per-call timeout
          - FlorenceServerError on 5xx
          - FlorenceClientError on 4xx
        """
        timeout = timeout_s if timeout_s is not None else self._default_timeout_s
        files = {"file": ("image", frame_bytes, mime_type or "image/jpeg")}
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                res = await client.post(
                    f"{self._base_url}/detect/florence", files=files
                )
        except httpx.TimeoutException as exc:
            raise FlorenceTimeout(f"timeout after {timeout}s") from exc
        except httpx.ConnectError as exc:
            # Treat connection failures as 5xx-equivalent (sidecar caller
            # retries up to 3× then records detector_error=True per §3.4).
            raise FlorenceServerError(0, f"connection failed: {exc}") from exc

        if 500 <= res.status_code < 600:
            raise FlorenceServerError(res.status_code, res.text)
        if res.status_code >= 400:
            raise FlorenceClientError(res.status_code, res.text)
        return res.json()
