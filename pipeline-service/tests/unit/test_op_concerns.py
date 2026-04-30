"""Cross-cutting op concerns — §3.0 of claude-plan.md.

For section-01, only the concerns that apply to frame_intake +
assemble_result + the 13 pass-through stubs are exercised here. The
Ollama-semaphore concurrency test from §3.0 lives in section-03 (where
the real Ollama client gains callers). Section-01 asserts only that
``OllamaClient`` exposes the per-model semaphore data structure.
"""
from __future__ import annotations

import logging
from typing import Any

import pytest


# --- determinism ---------------------------------------------------------------

def test_frame_intake_is_order_independent(tiny_jpeg_bytes: bytes) -> None:
    """Given the same set of frame inputs in two different list orders,
    frame_intake must produce byte-equal output (after sorting by frame_id).
    """
    from pipeline_service.ops.frame_intake import frame_intake_impl

    frames = [
        {
            "frame_id": "F-A",
            "sha256": "a" * 64,
            "mime_type": "image/jpeg",
            "photo_bytes": tiny_jpeg_bytes,
        },
        {
            "frame_id": "F-B",
            "sha256": "b" * 64,
            "mime_type": "image/jpeg",
            "photo_bytes": tiny_jpeg_bytes,
        },
        {
            "frame_id": "F-C",
            "sha256": "c" * 64,
            "mime_type": "image/jpeg",
            "photo_bytes": tiny_jpeg_bytes,
        },
    ]
    out1 = frame_intake_impl(frames)
    out2 = frame_intake_impl(list(reversed(frames)))
    ids1 = [f.frame_id for f in out1]
    ids2 = [f.frame_id for f in out2]
    assert ids1 == ids2, (
        "frame_intake must sort by frame_id so list-order does not change output"
    )


def test_passthrough_ops_empty_set_is_zero_not_nan() -> None:
    """Every numeric op must produce 0.0 (not NaN) for empty input.

    For section-01 the assertion target is the agreement_scoring stub
    on an empty SceneObservation.
    """
    import math

    from pipeline_service.ops.agreement_scoring import agreement_scoring_impl
    from pipeline_service.types import SceneObservation

    empty = SceneObservation.empty(scene_id="s", run_id="r", frame_ids=[])
    scored = agreement_scoring_impl(empty)
    assert scored.agreementCoverage == 0.0
    assert scored.agreementPrecision == 0.0
    assert not math.isnan(scored.agreementCoverage)
    assert not math.isnan(scored.agreementPrecision)


# --- log redaction infrastructure ---------------------------------------------

def test_log_redaction_redacts_full_content(caplog: pytest.LogCaptureFixture) -> None:
    from pipeline_service import log_redaction

    logger = logging.getLogger("pipeline_service.tests.redact")
    log_redaction.install_redactor(logger)

    with caplog.at_level(logging.INFO, logger="pipeline_service.tests.redact"):
        logger.info(
            "vlm_prompt_expansion completed",
            extra={
                "_redact": True,
                "prompts": ["Toaster", "Coffee Mug", "Living Plant", "Stack of Books"],
            },
        )

    record_messages = [r.getMessage() for r in caplog.records]
    formatted = " | ".join(record_messages)
    assert "Toaster" not in formatted
    assert "Coffee Mug" not in formatted
    assert "len=4" in formatted
    assert "sample_first_3=" in formatted


def test_log_redaction_is_noop_without_flag(caplog: pytest.LogCaptureFixture) -> None:
    from pipeline_service import log_redaction

    logger = logging.getLogger("pipeline_service.tests.no_redact")
    log_redaction.install_redactor(logger)

    with caplog.at_level(logging.INFO, logger="pipeline_service.tests.no_redact"):
        logger.info("ordinary message: hello world")

    formatted = " | ".join(r.getMessage() for r in caplog.records)
    assert "hello world" in formatted, "non-redacted records must pass through"


def test_log_redaction_enabled_by_default_in_server_bootstrap(
    isolated_env: dict[str, str],
) -> None:
    """server.create_app() must install the redactor on the package logger."""
    import logging

    from pipeline_service.api.server import create_app

    create_app()  # should install redactor as a side effect of bootstrap

    pkg_logger = logging.getLogger("pipeline_service")
    has_redactor = any(
        getattr(f, "_pipeline_redactor", False) for f in pkg_logger.filters
    )
    assert has_redactor, "log redaction must be installed by server bootstrap"


# --- ollama semaphore data structure (no callers in section-01) ---------------

def test_ollama_client_holds_per_model_semaphore() -> None:
    """The data structure must already exist even though no caller uses it
    until section-03.
    """
    import asyncio

    from pipeline_service.models.ollama_client import OllamaClient

    client = OllamaClient()
    sem_a = client.get_semaphore("qwen2.5vl:7b")
    sem_b = client.get_semaphore("qwen2.5vl:3b")
    sem_a_again = client.get_semaphore("qwen2.5vl:7b")

    assert isinstance(sem_a, asyncio.Semaphore)
    assert isinstance(sem_b, asyncio.Semaphore)
    assert sem_a is sem_a_again, "same model must share a single semaphore"
    assert sem_a is not sem_b, "different models must hold independent semaphores"


# --- replay-test infrastructure (just the loader / runner; assemble_result fixture) ---

def test_replay_runner_round_trips_assemble_result() -> None:
    """One fixture exists for assemble_result; running the op on the recorded
    input must reproduce the recorded output byte-equal.
    """
    from tests.replay.test_op_replay import (  # type: ignore[import-not-found]
        find_fixtures,
        run_replay,
    )

    fixtures = find_fixtures(op="assemble_result")
    assert fixtures, "at least one assemble_result fixture must ship in section-01"
    for fixture in fixtures:
        actual: Any = run_replay(fixture)
        expected = fixture.expected_json
        assert actual == expected, (
            f"replay diverged for {fixture.path}: got {actual!r} expected {expected!r}"
        )
