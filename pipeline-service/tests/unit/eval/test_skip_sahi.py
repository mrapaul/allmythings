"""Tests for ``EVAL_SKIP_SAHI`` env-gated short-circuit in ``sahi_recovery_op``.

The short-circuit is a tiny, surgical edit at the top of
``sahi_recovery_op``. These tests verify:

  * truthy env -> op returns ``[]`` and the underlying impl is not called;
  * env absent -> impl is called as usual;
  * falsy strings are treated as disabled.

The op signature reads three positional args (frames, per_detector_detections,
prompts); we feed the values through Dagster's ``build_op_context`` so
the op runs as Dagster would.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

import pipeline_service.dagster_defs as dd
from pipeline_service.types import PromptList


_EMPTY_PROMPTS = PromptList()


@pytest.fixture(autouse=True)
def _isolate_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("EVAL_SKIP_SAHI", raising=False)


def _invoke_op(monkeypatch: pytest.MonkeyPatch) -> tuple:
    """Return ``(result, impl_call_count)`` from invoking the op."""
    with patch("pipeline_service.dagster_defs.sahi_recovery_impl") as impl:
        impl.return_value = ["sentinel"]
        op_fn = getattr(dd.sahi_recovery_op, "compute_fn", dd.sahi_recovery_op)
        # Some Dagster versions wrap the user function on .compute_fn; on
        # others the @op decorator returns a callable that takes positional
        # args directly. Try the inner-callable path first, falling back to
        # invoking via the decorator's __call__ when needed.
        if callable(op_fn) and op_fn is not dd.sahi_recovery_op:
            try:
                result = op_fn([], [], _EMPTY_PROMPTS)
                return result, impl.call_count
            except TypeError:
                pass
        # Fall back: directly call the decorator output as Dagster does
        # in tests via build_op_context.
        from dagster import build_op_context

        ctx = build_op_context()
        result = dd.sahi_recovery_op(
            ctx,  # type: ignore[arg-type]
            [],
            [],
            _EMPTY_PROMPTS,
        )
        return result, impl.call_count


def test_skip_sahi_truthy_returns_empty_list_without_calling_impl(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("EVAL_SKIP_SAHI", "1")
    result, calls = _invoke_op(monkeypatch)
    assert result == []
    assert calls == 0


def test_env_absent_calls_impl_unchanged(monkeypatch: pytest.MonkeyPatch) -> None:
    result, calls = _invoke_op(monkeypatch)
    assert calls == 1
    assert result == ["sentinel"]


@pytest.mark.parametrize("value", ["0", "false", "False", "", "no"])
def test_falsy_strings_treated_as_skip_disabled(
    monkeypatch: pytest.MonkeyPatch, value: str
) -> None:
    monkeypatch.setenv("EVAL_SKIP_SAHI", value)
    result, calls = _invoke_op(monkeypatch)
    assert calls == 1
    assert result == ["sentinel"]


@pytest.mark.parametrize("value", ["1", "true", "True", "yes", "on", "ON"])
def test_truthy_strings_trigger_short_circuit(
    monkeypatch: pytest.MonkeyPatch, value: str
) -> None:
    monkeypatch.setenv("EVAL_SKIP_SAHI", value)
    result, calls = _invoke_op(monkeypatch)
    assert result == []
    assert calls == 0


def test_helper_returns_false_when_env_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("EVAL_SKIP_SAHI", raising=False)
    assert dd._eval_skip_sahi_enabled() is False


def test_helper_returns_true_for_truthy(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EVAL_SKIP_SAHI", "1")
    assert dd._eval_skip_sahi_enabled() is True
