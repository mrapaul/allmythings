"""Helpers for section-01's typed pass-through stub ops.

Each stub op file uses :func:`stub_metadata` to attach the
``op_stubbed=True`` marker tested in ``test_passthrough_ops.py`` and read
by the eval-rig in section-09.
"""
from __future__ import annotations

from typing import Any, Callable, TypeVar

F = TypeVar("F", bound=Callable[..., Any])


def stub_metadata() -> dict[str, Any]:
    """Single source of truth for the stub-marker metadata."""
    return {"op_stubbed": True, "section": "01"}


def mark_stub(fn: F) -> F:
    """Decorator that attaches a ``_stub_metadata`` helper onto ``fn``."""
    fn._stub_metadata = stub_metadata  # type: ignore[attr-defined]
    return fn
