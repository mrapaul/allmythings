"""Florence detection-service HTTP client shell.

Section-01 ships only the class signature and a no-op ``warmup``. Section-03
will wire real HTTP calls to the existing ``detection-service/`` Florence-2
HTTP server.
"""
from __future__ import annotations


class FlorenceClient:
    name = "florence_client"

    def __init__(self, base_url: str = "http://127.0.0.1:14001") -> None:
        self.base_url = base_url

    async def warmup(self) -> None:  # pragma: no cover - exercised in section-03
        return None
