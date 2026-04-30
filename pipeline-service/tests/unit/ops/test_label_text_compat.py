"""§3.11 label_text_compat — adversarial pairs + cache + degraded fallback."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from pipeline_service.models.label_encoder import (
    EMBED_DIM,
    LabelEncoder,
    label_text_compat,
)


_FIXTURES = json.loads(
    (
        Path(__file__).resolve().parent.parent.parent
        / "replay"
        / "fixtures"
        / "label_compat_pairs.json"
    ).read_text()
)


@pytest.mark.parametrize("entry", _FIXTURES, ids=lambda e: f'{e["a"]}_vs_{e["b"]}')
def test_calibration_sentinel(entry: dict) -> None:
    enc = LabelEncoder()
    out = label_text_compat(
        entry["a"],
        entry["b"],
        threshold=0.6,
        encoder=enc,
    )
    assert out == entry["expected"], (
        f'"{entry["a"]}" vs "{entry["b"]}" → expected {entry["expected"]} '
        f'got {out} ({entry["notes"]})'
    )


def test_encoding_dim_is_384() -> None:
    enc = LabelEncoder()
    out = enc.encode("hello world")
    assert out.shape == (EMBED_DIM,)
    assert EMBED_DIM == 384


def test_encodings_cached_within_run() -> None:
    calls = {"n": 0}

    def spy_backend(label: str) -> np.ndarray:
        calls["n"] += 1
        return np.zeros(EMBED_DIM, dtype=np.float32) + 1.0 / EMBED_DIM

    enc = LabelEncoder(backend=spy_backend)
    enc.encode("lamp")
    enc.encode("lamp")
    enc.encode("lamp")
    assert calls["n"] == 1


def test_reset_cache_drops_entries() -> None:
    enc = LabelEncoder()
    enc.encode("lamp")
    assert "lamp" in enc._cache
    enc.reset_cache()
    assert enc._cache == {}


def test_encoder_persistent_failure_returns_true_degraded() -> None:
    def boom(label: str) -> np.ndarray:
        raise RuntimeError("encoder dead")

    enc = LabelEncoder(backend=boom)
    # Persistent failure → label_text_compat returns True (degraded — does NOT
    # block merges).
    assert label_text_compat("a", "b", threshold=0.6, encoder=enc) is True


def test_threshold_is_respected() -> None:
    """A higher threshold should make even synonyms fail."""
    enc = LabelEncoder()
    assert label_text_compat("sofa", "couch", threshold=0.6, encoder=enc) is True
    assert label_text_compat("sofa", "couch", threshold=0.999, encoder=enc) is False
