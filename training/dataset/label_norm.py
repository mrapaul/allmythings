"""Mechanical label normalization only — whitespace, case, separators,
punctuation. Deliberately contains NO semantic knowledge: no synonym table, no
category mapping, no object vocabulary. Semantics come from the data (see
derive_taxonomy.py) or from the model itself (open-vocabulary VLM track)."""

from __future__ import annotations

import re

_SEPARATORS = re.compile(r"[_\-/]+")
_NON_ALNUM = re.compile(r"[^a-z0-9 ]+")
_WHITESPACE = re.compile(r"\s+")


def normalize_label(label: str) -> str:
    """Lowercase, split camelCase, collapse separators/punctuation/whitespace."""
    if not label:
        return ""
    spaced = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", str(label))
    lowered = _SEPARATORS.sub(" ", spaced.lower())
    cleaned = _NON_ALNUM.sub(" ", lowered)
    return _WHITESPACE.sub(" ", cleaned).strip()
