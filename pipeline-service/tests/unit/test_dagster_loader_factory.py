"""Tests for the loader factory that wires Grounding DINO HTTP backend
into the dagster ops at op-invocation time.

This is the production wiring for D + E (sections 3.5, 3.6) — the ops
themselves stay backend-agnostic via dependency injection; the factory
picks fake-vs-http from env.
"""
from __future__ import annotations

import pytest

from pipeline_service.dagster_defs import _build_gdino_loader
from pipeline_service.models.grounding_dino import GroundingDinoLoader
from pipeline_service.models.grounding_dino_http import HttpGroundingDinoBackend


@pytest.fixture(autouse=True)
def _clean_gdino_env(monkeypatch):
    """Reset every env var the factory consults so tests are independent."""
    for key in (
        "GROUNDING_DINO_BACKEND",
        "DETECTION_SERVICE_URL",
        "GROUNDING_DINO_TIMEOUT_S",
        "DETECTION_BOX_THRESHOLD",
        "DETECTION_TEXT_THRESHOLD",
    ):
        monkeypatch.delenv(key, raising=False)


def test_default_backend_is_http() -> None:
    loader = _build_gdino_loader()
    assert isinstance(loader, GroundingDinoLoader)
    assert isinstance(loader._backend, HttpGroundingDinoBackend)


def test_explicit_http_backend(monkeypatch) -> None:
    monkeypatch.setenv("GROUNDING_DINO_BACKEND", "http")
    loader = _build_gdino_loader()
    assert isinstance(loader._backend, HttpGroundingDinoBackend)


def test_fake_backend_via_env(monkeypatch) -> None:
    """``GROUNDING_DINO_BACKEND=fake`` must keep the deterministic fake so
    CI / replay tests don't need a live detection-service sidecar."""
    monkeypatch.setenv("GROUNDING_DINO_BACKEND", "fake")
    loader = _build_gdino_loader()
    # Fake backend is the module-level _deterministic_fake_gdino function.
    from pipeline_service.models.grounding_dino import _deterministic_fake_gdino
    assert loader._backend is _deterministic_fake_gdino


def test_http_backend_picks_up_url_and_thresholds(monkeypatch) -> None:
    monkeypatch.setenv("DETECTION_SERVICE_URL", "http://10.0.0.5:8001")
    monkeypatch.setenv("GROUNDING_DINO_TIMEOUT_S", "45")
    monkeypatch.setenv("DETECTION_BOX_THRESHOLD", "0.42")
    monkeypatch.setenv("DETECTION_TEXT_THRESHOLD", "0.31")
    loader = _build_gdino_loader()
    backend = loader._backend
    assert isinstance(backend, HttpGroundingDinoBackend)
    assert backend.base_url == "http://10.0.0.5:8001"
    assert backend.timeout_s == 45.0
    assert backend.box_threshold == 0.42
    assert backend.text_threshold == 0.31
