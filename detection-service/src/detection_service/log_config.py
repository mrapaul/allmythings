"""Structured JSON logging with OpenTelemetry trace correlation.

Every log line emitted through structlog (and through stdlib logging,
since structlog is configured on top of it) is rendered as a JSON object
on stdout with trace_id / span_id injected from the active OTel span.
This lets Grafana/Loki queries span the whole request path across
api-service and detection-service with a single trace id filter.
"""
from __future__ import annotations

import logging
from typing import Any

import structlog
from opentelemetry import trace


def _add_trace_context(
    _logger: Any, _method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """structlog processor that enriches each event with OTel trace ids."""
    span = trace.get_current_span()
    if span is None:
        return event_dict
    ctx = span.get_span_context()
    # A non-recording / invalid span has trace_id == 0; skip those.
    if ctx and ctx.trace_id:
        event_dict["trace_id"] = format(ctx.trace_id, "032x")
        event_dict["span_id"] = format(ctx.span_id, "016x")
    return event_dict


def configure_logging(level: str = "INFO") -> None:
    """Configure structlog -> stdout JSON with OTel trace_id/span_id injected.

    Safe to call multiple times; structlog.configure is idempotent.
    """
    logging.basicConfig(format="%(message)s", level=level)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            _add_trace_context,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
