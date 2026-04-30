"""Structured-log redactor for VLM-derived text.

VLM outputs (prompt lists from ``vlm_prompt_expansion``, structured
attributes from ``classification_refine``) may contain in-frame text
inferred from documents — that is the most likely PII source. We redact
the **formatted** log message to structural-shape only:

    "<original text> | len=N sample_first_3=[...]"

Full content stays attached to the LogRecord's ``extra``, so Dagster
asset metadata (which lives only on the local Mac) keeps it.

Toggleable via ``PIPELINE_LOG_REDACTION`` env var (default true).
"""
from __future__ import annotations

import logging
import os
import re
from typing import Iterable


_NOUN_HEAD_TOKENS = re.compile(r"[A-Za-z][A-Za-z\-]+")


def _noun_heads(items: Iterable[str], limit: int = 3) -> list[str]:
    """Lower-case noun-head sample of the first ``limit`` items.

    Keep only ASCII word tokens; drop any token containing potentially
    sensitive characters (digits, punctuation, etc.) so the formatted
    log line cannot accidentally leak short phone numbers / IDs.
    """
    out: list[str] = []
    for item in items:
        if len(out) >= limit:
            break
        if not isinstance(item, str):
            continue
        tokens = _NOUN_HEAD_TOKENS.findall(item)
        if not tokens:
            continue
        head = tokens[0].lower()
        out.append(head)
    return out


class _RedactingFilter(logging.Filter):
    """Filter that rewrites ``record.msg`` when ``record._redact`` is true."""

    _pipeline_redactor = True  # sentinel attribute used by the install check

    def filter(self, record: logging.LogRecord) -> bool:
        if not getattr(record, "_redact", False):
            return True

        prompts = getattr(record, "prompts", None)
        attributes = getattr(record, "attributes", None)
        bits: list[str] = []
        if prompts is not None:
            try:
                length = len(prompts)
            except TypeError:
                length = 0
            sample = _noun_heads(prompts) if length else []
            bits.append(f"len={length} sample_first_3={sample}")
        if attributes is not None:
            try:
                keys = list(attributes.keys())
            except AttributeError:
                keys = []
            bits.append(f"attr_keys={sorted(keys)}")

        original = record.getMessage()
        record.msg = f"{original} | " + " ".join(bits) if bits else original
        record.args = ()  # original args are merged into msg already
        return True


def _redaction_enabled() -> bool:
    raw = os.getenv("PIPELINE_LOG_REDACTION", "true").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def install_redactor(logger: logging.Logger) -> None:
    """Install the redacting filter on ``logger`` (idempotent).

    No-op when ``PIPELINE_LOG_REDACTION`` disables redaction.
    """
    if not _redaction_enabled():
        return
    if any(getattr(f, "_pipeline_redactor", False) for f in logger.filters):
        return
    logger.addFilter(_RedactingFilter())
