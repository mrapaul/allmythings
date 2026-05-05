"""Shared fixtures for the gt_eval test suite.

These fixtures are consumed across multiple sections (§02–§08); keeping
them in one place locks the mock interfaces and avoids drift.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import numpy as np
import pytest


@pytest.fixture
def mock_ollama_client() -> AsyncMock:
    """Async mock of ``OllamaClient``.

    §04's ``QwenLocalJudge`` tests configure ``set_response`` /
    ``raise_on_call`` per case. The mock exposes the same call shape as
    ``pipeline_service.models.ollama_client.OllamaClient.generate`` so a
    drop-in swap works in production constructors.
    """
    client = AsyncMock()

    # Default healthy generate response — tests override per case.
    client.generate.return_value = {"response": '{"verdict": "unsure"}'}

    # Per-instance recording of the most recent kwargs. Set on the mock
    # object via ``object.__setattr__`` so AsyncMock doesn't intercept it.
    object.__setattr__(client, "last_call_kwargs", {})

    # Wrap the generate AsyncMock with a recording shim. We retain
    # ``client.generate`` as the underlying AsyncMock so test helpers
    # (``set_response``, ``raise_on_call``) can write to its
    # ``return_value`` / ``side_effect`` directly.
    underlying_generate = client.generate

    async def _record_and_call(**kwargs):  # type: ignore[no-untyped-def]
        object.__setattr__(client, "last_call_kwargs", dict(kwargs))
        return await underlying_generate(**kwargs)

    # Helpers must mutate the AsyncMock the wrapper delegates to, NOT
    # the wrapper function (which ignores ``.return_value``).
    def set_response(payload):
        if isinstance(payload, str):
            underlying_generate.return_value = {"response": payload}
        else:
            underlying_generate.return_value = payload

    def raise_on_call(exc: BaseException):
        underlying_generate.side_effect = exc

    client.set_response = set_response  # type: ignore[attr-defined]
    client.raise_on_call = raise_on_call  # type: ignore[attr-defined]

    # Replace AFTER helpers are bound so they close over ``underlying_generate``.
    client.generate = _record_and_call  # type: ignore[assignment]
    return client


@pytest.fixture
def mock_label_encoder() -> MagicMock:
    """Mock of ``LabelEncoder``.

    §03's ``CosineLabelMatcher`` tests configure ``encode`` to return
    chosen embedding vectors for a small fixture pair set. The mock
    returns a deterministic 1.0-norm vector by default so unrelated
    tests don't blow up on cosine math.
    """
    enc = MagicMock()
    enc._DEFAULT_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

    def _default_encode(text: str) -> np.ndarray:
        rng = np.random.default_rng(abs(hash(text)) % (2**32))
        v = rng.standard_normal(8).astype(np.float32)
        return v / (np.linalg.norm(v) + 1e-9)

    enc.encode.side_effect = _default_encode
    return enc


@pytest.fixture(scope="session")
def eval_fixtures_dir() -> Path:
    """Path to ``tests/replay/fixtures/eval/`` — the shared corpus."""
    here = Path(__file__).resolve().parent
    return here.parent.parent / "replay" / "fixtures" / "eval"


@pytest.fixture
def tmp_eval_data_dir(tmp_path: Path) -> Path:
    """Per-test scratch directory mimicking ``pipeline-service/eval/``."""
    d = tmp_path / "eval"
    d.mkdir()
    return d
