"""§8.3 log redaction infrastructure."""
from __future__ import annotations

import logging

import pytest


def test_install_redactor_adds_filter() -> None:
    from pipeline_service import log_redaction

    logger = logging.getLogger("pipeline_service.tests.install")
    log_redaction.install_redactor(logger)
    assert any(getattr(f, "_pipeline_redactor", False) for f in logger.filters)


def test_redact_flag_rewrites_to_structural_shape(
    caplog: pytest.LogCaptureFixture,
) -> None:
    from pipeline_service import log_redaction

    logger = logging.getLogger("pipeline_service.tests.redact_shape")
    log_redaction.install_redactor(logger)

    with caplog.at_level(logging.INFO, logger="pipeline_service.tests.redact_shape"):
        logger.info(
            "vlm_prompt_expansion completed",
            extra={
                "_redact": True,
                "prompts": ["Toaster", "Yellow Coffee Mug", "PRIVATE-LEAKED-TEXT"],
            },
        )
    formatted = " | ".join(r.getMessage() for r in caplog.records)
    assert "PRIVATE-LEAKED-TEXT" not in formatted
    assert "len=3" in formatted
    # Sample exposes only lowercased noun heads — no full strings, no unicode
    # surprises.  Present test-text "PRIVATE-LEAKED-TEXT" must not appear.
    assert "sample_first_3=" in formatted


def test_full_content_present_in_record_extras_for_dagster_metadata(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """The redactor must rewrite the FORMATTED message but leave the raw
    extras untouched, so Dagster asset metadata can still log full content
    (which never reaches Loki in the actual deployment).
    """
    from pipeline_service import log_redaction

    logger = logging.getLogger("pipeline_service.tests.full_extras")
    log_redaction.install_redactor(logger)

    with caplog.at_level(logging.INFO, logger="pipeline_service.tests.full_extras"):
        logger.info(
            "x",
            extra={"_redact": True, "prompts": ["alpha", "beta"]},
        )
    record = caplog.records[-1]
    # Extras still carry the full payload for downstream attachment.
    assert getattr(record, "prompts") == ["alpha", "beta"]


def test_no_redact_flag_passes_through(caplog: pytest.LogCaptureFixture) -> None:
    from pipeline_service import log_redaction

    logger = logging.getLogger("pipeline_service.tests.passthrough")
    log_redaction.install_redactor(logger)

    with caplog.at_level(logging.INFO, logger="pipeline_service.tests.passthrough"):
        logger.info("plain message: 42 is the answer")
    formatted = " | ".join(r.getMessage() for r in caplog.records)
    assert "plain message: 42 is the answer" in formatted


def test_redactor_disabled_via_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PIPELINE_LOG_REDACTION", "false")
    from pipeline_service import log_redaction

    logger = logging.getLogger("pipeline_service.tests.disabled")
    # Reload-style: when redaction is disabled, install_redactor must be a no-op.
    log_redaction.install_redactor(logger)
    assert not any(getattr(f, "_pipeline_redactor", False) for f in logger.filters)
