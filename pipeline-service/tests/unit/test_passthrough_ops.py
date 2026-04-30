"""Section-01 covers the 13 middle ops as typed pass-through stubs.

Each must:
  - return the documented empty-set value for its output type;
  - emit numeric outputs of 0.0 (not NaN) for empty input;
  - not call any model client;
  - annotate Dagster metadata with op_stubbed=True (verified via the
    ``_stub_metadata()`` helper attached to each stub function).

The 13 ops between frame_intake and assemble_result:
  scene_embedding, vlm_prompt_expansion, florence_detect,
  grounding_dino_detect, sahi_recovery, effsam_segment, box_fusion,
  crop_embedding, cross_pass_dedup, cross_frame_dedup,
  classification_refine, agreement_scoring, self_diagnosis.
"""
from __future__ import annotations

import math
from typing import Any, Iterable

import pytest


STUB_OPS = [
    # scene_embedding — REAL in section-04
    # vlm_prompt_expansion — REAL in section-04
    # florence_detect — REAL in section-03
    # grounding_dino_detect — REAL in section-05
    # sahi_recovery — REAL in section-05
    # effsam_segment — REAL in section-05
    # box_fusion — REAL in section-06
    # crop_embedding — REAL in section-04
    # cross_pass_dedup — REAL in section-06
    # cross_frame_dedup — REAL in section-06
    # classification_refine — REAL in section-03
    "agreement_scoring",
    "self_diagnosis",
]


def _import_stub(op_name: str):
    import importlib

    return importlib.import_module(f"pipeline_service.ops.{op_name}")


@pytest.mark.parametrize("op_name", STUB_OPS)
def test_stub_module_exposes_impl_function(op_name: str) -> None:
    mod = _import_stub(op_name)
    impl_name = f"{op_name}_impl"
    assert hasattr(mod, impl_name), (
        f"{op_name} must expose {impl_name}() callable"
    )


@pytest.mark.parametrize("op_name", STUB_OPS)
def test_stub_advertises_op_stubbed_true(op_name: str) -> None:
    mod = _import_stub(op_name)
    impl = getattr(mod, f"{op_name}_impl")
    metadata = getattr(impl, "_stub_metadata", None)
    assert callable(metadata), (
        f"{op_name}_impl must have a _stub_metadata() helper for Dagster metadata"
    )
    md = metadata()
    assert md.get("op_stubbed") is True


@pytest.mark.parametrize("op_name", STUB_OPS)
def test_stub_does_not_invoke_model_clients(
    op_name: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Spy on every model client class; running the stub must never instantiate
    or call any of them.
    """
    from pipeline_service.models import (
        dinov2,
        effsam,
        florence_client,
        grounding_dino,
        label_encoder,
        ollama_client,
    )

    sentinels: list[str] = []

    def _make_spy(name: str):
        def _spy(*_a: Any, **_k: Any) -> None:
            sentinels.append(name)
            raise AssertionError(f"stub {op_name} must not touch {name}")

        return _spy

    monkeypatch.setattr(
        florence_client.FlorenceClient, "__init__", _make_spy("FlorenceClient")
    )
    monkeypatch.setattr(
        ollama_client.OllamaClient, "__init__", _make_spy("OllamaClient")
    )
    monkeypatch.setattr(
        grounding_dino.GroundingDinoLoader,
        "__init__",
        _make_spy("GroundingDinoLoader"),
    )
    monkeypatch.setattr(effsam.EffSAMLoader, "__init__", _make_spy("EffSAMLoader"))
    monkeypatch.setattr(dinov2.DinoV2Loader, "__init__", _make_spy("DinoV2Loader"))
    monkeypatch.setattr(
        label_encoder.LabelEncoder, "__init__", _make_spy("LabelEncoder")
    )

    mod = _import_stub(op_name)
    impl = getattr(mod, f"{op_name}_impl")
    args = _zero_input_for(op_name)
    result = impl(*args)
    assert sentinels == [], f"{op_name} stub touched a model client"
    # And the result must be defined (not None) so downstream stubs can chain.
    assert result is not None


def test_agreement_scoring_empty_is_zero_not_nan() -> None:
    from pipeline_service.ops.agreement_scoring import agreement_scoring_impl
    from pipeline_service.types import SceneObservation

    obs = SceneObservation.empty(scene_id="s", run_id="r", frame_ids=["F0"])
    out = agreement_scoring_impl(obs)
    assert out.agreementCoverage == 0.0
    assert out.agreementPrecision == 0.0
    assert not math.isnan(out.agreementCoverage)
    assert not math.isnan(out.agreementPrecision)


def test_box_fusion_empty_yields_empty_list() -> None:
    """box_fusion is real in section-06; empty input → []."""
    from pipeline_service.ops.box_fusion import box_fusion_impl

    assert box_fusion_impl([]) == []


def test_self_diagnosis_terminal_branch_yields_input(
    isolated_env: dict[str, str],
) -> None:
    from pipeline_service.ops.self_diagnosis import self_diagnosis_impl
    from pipeline_service.types import SceneObservation

    obs = SceneObservation.empty(scene_id="s", run_id="r", frame_ids=["F0"])
    yielded = list(self_diagnosis_impl(obs, rerun_depth=0))
    # Section-01 stub: always terminal, never DynamicOut fan-out — but the
    # signature is DynamicOut so section-07 can drop in fan-out logic.
    assert yielded == [obs]


# -- helpers --------------------------------------------------------------------

def _zero_input_for(op_name: str) -> Iterable[Any]:
    """Provide a documented empty-set input tuple for each stub op so the
    parametrised model-client test can call them uniformly.
    """
    from pipeline_service.types import (
        DedupedFrame,
        FusedFrame,
        SceneObservation,
    )

    empty_obs = SceneObservation.empty(scene_id="s", run_id="r", frame_ids=[])
    if op_name == "scene_embedding":
        return ([],)
    if op_name == "vlm_prompt_expansion":
        return ([], [])
    if op_name == "florence_detect":
        return ([],)
    if op_name == "grounding_dino_detect":
        return ([], [])
    if op_name == "sahi_recovery":
        return ([], [])
    if op_name == "effsam_segment":
        return ([], [])
    if op_name == "box_fusion":
        return ("F0", [])
    if op_name == "crop_embedding":
        return ("F0", FusedFrame(frame_id="F0", fused=[]))
    if op_name == "cross_pass_dedup":
        return (FusedFrame(frame_id="F0", fused=[]), {})
    if op_name == "cross_frame_dedup":
        return ([],)
    if op_name == "classification_refine":
        return (empty_obs,)
    if op_name == "agreement_scoring":
        return (empty_obs,)
    if op_name == "self_diagnosis":
        return (empty_obs, 0)
    raise AssertionError(f"unknown op {op_name}")
