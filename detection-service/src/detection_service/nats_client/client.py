from __future__ import annotations
import json
from typing import Callable, Awaitable, Any
import nats
from nats.aio.client import Client as NATS
from nats.js.client import JetStreamContext
from opentelemetry import trace, propagate
from opentelemetry.trace import SpanKind
from ..config import settings

PayloadHandler = Callable[[str, dict, dict], Awaitable[None]]


class NatsClient:
    def __init__(self) -> None:
        self._nc: NATS | None = None
        self._js: JetStreamContext | None = None

    async def connect(self) -> None:
        self._nc = await nats.connect(settings.nats_url)
        self._js = self._nc.jetstream()

    async def close(self) -> None:
        if self._nc is not None:
            await self._nc.drain()
            self._nc = None
            self._js = None

    async def publish(self, subject: str, payload: dict[str, Any]) -> None:
        assert self._nc is not None, "NatsClient not connected"
        headers: dict[str, str] = {}
        propagate.inject(headers)
        body = json.dumps(payload).encode("utf-8")
        await self._nc.publish(subject, body, headers=headers)

    async def subscribe(self, subject: str, handler: PayloadHandler):
        assert self._nc is not None, "NatsClient not connected"

        tracer = trace.get_tracer(__name__)

        async def wrapper(msg):
            hdrs = dict(msg.headers or {})
            ctx = propagate.extract(hdrs)
            with tracer.start_as_current_span(
                f"nats.consume {subject}", context=ctx, kind=SpanKind.CONSUMER
            ):
                payload = json.loads(msg.data.decode("utf-8"))
                await handler(msg.subject, payload, hdrs)

        return await self._nc.subscribe(subject, cb=wrapper)

    async def ensure_streams(self) -> None:
        """Create the 'fast' and 'deep' JetStream streams if missing."""
        assert self._js is not None, "NatsClient not connected"
        for name, subjects in [("fast", ["fast.>"]), ("deep", ["deep.>"])]:
            try:
                await self._js.stream_info(name)
            except Exception:
                from nats.js.api import StreamConfig
                await self._js.add_stream(StreamConfig(name=name, subjects=subjects))
