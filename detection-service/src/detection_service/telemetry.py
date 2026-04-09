from __future__ import annotations
import logging
from typing import Optional
from fastapi import FastAPI
from opentelemetry import trace, metrics
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.resources import Resource, SERVICE_NAME, SERVICE_VERSION
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.psycopg import PsycopgInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from prometheus_client import make_asgi_app

from .config import settings

log = logging.getLogger(__name__)

_configured = False


def configure_telemetry(app: Optional[FastAPI], service_name: str = None) -> None:
    global _configured
    if _configured:
        return

    name = service_name or settings.service_name
    resource = Resource.create({
        SERVICE_NAME: name,
        SERVICE_VERSION: settings.version,
    })

    # Traces
    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=settings.otlp_endpoint, insecure=True))
    )
    trace.set_tracer_provider(tracer_provider)

    # Metrics
    metric_reader = PeriodicExportingMetricReader(
        OTLPMetricExporter(endpoint=settings.otlp_endpoint, insecure=True),
        export_interval_millis=15000,
    )
    meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
    metrics.set_meter_provider(meter_provider)

    # Auto-instrumentation
    if app is not None:
        FastAPIInstrumentor.instrument_app(app)
    PsycopgInstrumentor().instrument()
    HTTPXClientInstrumentor().instrument()

    _configured = True
    log.info("OpenTelemetry configured for %s", name)


def mount_prometheus(app: FastAPI) -> None:
    """Mounts a /metrics endpoint exposing the prometheus_client default registry."""
    prom_app = make_asgi_app()
    app.mount("/metrics", prom_app)
