import json
import pytest
from detection_service.nats_client.client import NatsClient


@pytest.fixture
async def nats():
    c = NatsClient()
    await c.connect()
    yield c
    await c.close()


async def test_publish_and_subscribe_roundtrip(nats):
    received = []

    async def handler(subject: str, payload: dict, trace_ctx: dict):
        received.append((subject, payload, trace_ctx))

    sub = await nats.subscribe("test.roundtrip", handler)
    await nats.publish("test.roundtrip", {"hello": "world"})

    # Give NATS time to deliver
    import asyncio
    for _ in range(20):
        if received:
            break
        await asyncio.sleep(0.1)

    await sub.unsubscribe()
    assert len(received) == 1
    assert received[0][1] == {"hello": "world"}


async def test_trace_context_propagated(nats):
    from opentelemetry import trace
    from detection_service.telemetry import configure_telemetry
    configure_telemetry(app=None)

    received_ctx = []

    async def handler(subject: str, payload: dict, trace_ctx: dict):
        received_ctx.append(trace_ctx)

    sub = await nats.subscribe("test.trace", handler)
    tracer = trace.get_tracer(__name__)
    with tracer.start_as_current_span("publisher"):
        await nats.publish("test.trace", {"msg": 1})

    import asyncio
    for _ in range(20):
        if received_ctx:
            break
        await asyncio.sleep(0.1)

    await sub.unsubscribe()
    assert "traceparent" in received_ctx[0]
