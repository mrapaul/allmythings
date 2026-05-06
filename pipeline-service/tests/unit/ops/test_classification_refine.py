"""§3.12 classification_refine — Qwen-VL tier chain."""
from __future__ import annotations

import asyncio
import logging
from typing import Any
from unittest.mock import AsyncMock

import pytest

from pipeline_service.models.ollama_client import (
    OllamaClient,
    OllamaParseError,
    OllamaServerError,
    OllamaTimeout,
)
from pipeline_service.ops.classification_refine import (
    _dedupe_by_type,
    classification_refine_impl,
)
from pipeline_service.types import (
    AlternateLabel,
    BBox,
    ContributingSignal,
    PipelineConfig,
    PipelineDetection,
    SceneObservation,
)


def _scene(n: int) -> SceneObservation:
    obs = SceneObservation.empty(scene_id="s", run_id="r", frame_ids=["F0"])
    obs = obs.model_copy(
        update={
            "detections": [
                PipelineDetection(
                    id=f"d{i}",
                    bbox=BBox(x=0, y=0, width=1, height=1),
                    primaryLabel="lamp",
                )
                for i in range(n)
            ]
        }
    )
    return obs


@pytest.fixture
def mock_ollama() -> AsyncMock:
    return AsyncMock(spec=OllamaClient)


@pytest.mark.asyncio
async def test_empty_detections_makes_no_calls(mock_ollama) -> None:
    obs = _scene(0)
    out = await classification_refine_impl(obs, ollama=mock_ollama, config=PipelineConfig())
    assert out is obs or out.detections == []
    mock_ollama.generate.assert_not_called()


@pytest.mark.asyncio
async def test_happy_path_default_tier_populates_attributes(mock_ollama) -> None:
    """Default tier order is 3B → 7B → moondream (3B fits alongside
    Florence + Grounding DINO on MPS without OOM-spilling Ollama to CPU).
    Each call must request keep_alive='60s' so the model stays hot
    during the burst's parallel calls but unloads soon after."""
    mock_ollama.generate.return_value = {
        "name": "Brass desk lamp",
        "category": "lighting",
        "color": "brass",
    }
    obs = _scene(1)
    out = await classification_refine_impl(obs, ollama=mock_ollama, config=PipelineConfig())
    assert out.detections[0].vlmStructuredAttributes == {
        "name": "Brass desk lamp",
        "category": "lighting",
        "color": "brass",
    }
    args = mock_ollama.generate.call_args
    assert args.kwargs["model"] == "qwen2.5vl:3b"
    assert args.kwargs.get("keep_alive") == "60s"


@pytest.mark.asyncio
async def test_vlm_type_is_promoted_to_primary_label(mock_ollama) -> None:
    """When Qwen-VL returns a bare ``type`` ("coffee table"), that becomes
    the ``primaryLabel`` — replacing the upstream detector's noisy label.
    Type-only primary labels keep the inventory list scannable AND let
    post-classification dedup collapse same-type overlapping boxes."""
    mock_ollama.generate.return_value = {
        "type": "side table",
        "name": "Marble side table",
        "category": "furniture",
        "color": "gray",
        "material": "marble",
    }
    obs = _scene(1)
    out = await classification_refine_impl(obs, ollama=mock_ollama, config=PipelineConfig())
    assert out.detections[0].primaryLabel == "side table"


@pytest.mark.asyncio
async def test_vlm_name_used_when_type_missing(mock_ollama) -> None:
    """If the VLM omits ``type`` but provides ``name``, fall back to name —
    we never want to leave the primary as the upstream noisy caption."""
    mock_ollama.generate.return_value = {
        "name": "Marble side table",
        "color": "gray",
    }
    obs = _scene(1)
    out = await classification_refine_impl(obs, ollama=mock_ollama, config=PipelineConfig())
    assert out.detections[0].primaryLabel == "Marble side table"


@pytest.mark.asyncio
async def test_vlm_attributes_become_alternate_labels(mock_ollama) -> None:
    """The descriptive ``name`` plus ``category``, ``color``, ``material``
    and each ``search_tags`` entry all become ``alternateLabels`` so
    search hits items by attribute (the user explicitly asked for
    "color, texture, material searchable")."""
    mock_ollama.generate.return_value = {
        "type": "side table",
        "name": "Marble side table",
        "category": "furniture",
        "color": "gray",
        "material": "marble",
        "search_tags": ["round", "decorative"],
    }
    obs = _scene(1)
    out = await classification_refine_impl(obs, ollama=mock_ollama, config=PipelineConfig())
    alts = {a.label for a in out.detections[0].alternateLabels}
    # The descriptive name leads, then category/color/material/search_tags.
    assert {"Marble side table", "furniture", "gray", "marble", "round", "decorative"} <= alts
    # The primary type itself is not duplicated.
    assert "side table" not in alts


@pytest.mark.asyncio
async def test_alternate_labels_dedupe_against_primary_case_insensitive(
    mock_ollama,
) -> None:
    """If a search_tag matches the promoted type (modulo case), don't list
    it twice."""
    mock_ollama.generate.return_value = {
        "type": "side table",
        "search_tags": ["side table", "SIDE TABLE", "Side Table"],
    }
    obs = _scene(1)
    out = await classification_refine_impl(obs, ollama=mock_ollama, config=PipelineConfig())
    alts = [a.label for a in out.detections[0].alternateLabels]
    assert alts == []  # all tags duplicate the promoted type


@pytest.mark.asyncio
async def test_empty_vlm_attrs_preserves_original_primary_label(mock_ollama) -> None:
    """When every tier fails (attrs={}), the original primaryLabel stays put
    — we never blank out the only label the detector gave us."""
    mock_ollama.generate.side_effect = [
        OllamaServerError(500, "qwen7b 500"),
        OllamaTimeout("qwen3b timeout"),
        OllamaParseError("moondream parse"),
    ]
    obs = _scene(1)
    out = await classification_refine_impl(obs, ollama=mock_ollama, config=PipelineConfig())
    assert out.detections[0].primaryLabel == "lamp"  # untouched
    assert out.detections[0].alternateLabels == []
    assert out.detections[0].vlmStructuredAttributes == {}


@pytest.mark.asyncio
async def test_tier_chain_falls_through_on_timeout_and_parse_error(mock_ollama) -> None:
    mock_ollama.generate.side_effect = [
        OllamaTimeout("qwen7b timeout"),
        OllamaParseError("qwen3b parse"),
        {"name": "OK from moondream"},
    ]
    obs = _scene(1)
    out = await classification_refine_impl(obs, ollama=mock_ollama, config=PipelineConfig())
    assert mock_ollama.generate.await_count == 3
    assert out.detections[0].vlmStructuredAttributes == {"name": "OK from moondream"}


@pytest.mark.asyncio
async def test_all_tiers_fail_yields_empty_dict_not_default(mock_ollama) -> None:
    mock_ollama.generate.side_effect = [
        OllamaServerError(500, "qwen7b 500"),
        OllamaTimeout("qwen3b timeout"),
        OllamaParseError("moondream parse"),
    ]
    obs = _scene(1)
    out = await classification_refine_impl(obs, ollama=mock_ollama, config=PipelineConfig())
    # Empty dict is the contract — NOT a default attribute set, NOT None.
    assert out.detections[0].vlmStructuredAttributes == {}


@pytest.mark.asyncio
async def test_parse_error_is_not_retried_within_tier(mock_ollama) -> None:
    """A single parse error in tier 1 must fall through to tier 2 immediately,
    not retry tier 1.
    """
    mock_ollama.generate.side_effect = [
        OllamaParseError("tier 1 parse"),
        {"name": "OK"},
    ]
    obs = _scene(1)
    await classification_refine_impl(obs, ollama=mock_ollama, config=PipelineConfig())
    assert mock_ollama.generate.await_count == 2


@pytest.mark.asyncio
async def test_classification_tier_forcing_skips_earlier_tiers(mock_ollama) -> None:
    mock_ollama.generate.return_value = {"name": "moondream"}
    cfg = PipelineConfig(classificationTierForcing="moondream")
    obs = _scene(1)
    await classification_refine_impl(obs, ollama=mock_ollama, config=cfg)
    args = mock_ollama.generate.call_args
    assert args.kwargs["model"] == "moondream"
    assert mock_ollama.generate.await_count == 1


@pytest.mark.asyncio
async def test_per_detection_call_count(mock_ollama) -> None:
    mock_ollama.generate.return_value = {"name": "x"}
    obs = _scene(3)
    await classification_refine_impl(obs, ollama=mock_ollama, config=PipelineConfig())
    assert mock_ollama.generate.await_count == 3


@pytest.mark.asyncio
async def test_log_redaction_applied(
    mock_ollama, caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The op must log VLM output via the redacting logger so attribute
    values never reach Loki."""
    monkeypatch.setenv("PIPELINE_LOG_REDACTION", "true")
    from pipeline_service import log_redaction

    target_logger = logging.getLogger("pipeline_service.ops.classification_refine")
    log_redaction.install_redactor(target_logger)
    mock_ollama.generate.return_value = {"name": "secret-text", "color": "blue"}
    obs = _scene(1)
    with caplog.at_level(logging.INFO, logger="pipeline_service"):
        await classification_refine_impl(obs, ollama=mock_ollama, config=PipelineConfig())
    formatted = " | ".join(r.getMessage() for r in caplog.records)
    assert "secret-text" not in formatted
    assert "blue" not in formatted
    # Structural marker present in at least one record.
    assert "len=" in formatted or "attr_keys=" in formatted


@pytest.mark.asyncio
async def test_image_bytes_threaded_through_to_ollama(mock_ollama) -> None:
    """The op must send the burst's first non-failed frame as JPEG to Ollama
    (parity with enrich-item.activity.ts:55 which passed input.imageBase64).
    Sending b"" silently breaks parity with a real model — regression for
    the section-03 review's MUST-FIX 1.
    """
    from datetime import datetime, timezone
    from io import BytesIO

    from PIL import Image
    import numpy as np

    from pipeline_service.types import Frame

    arr = np.full((4, 4, 3), 200, dtype=np.uint8)
    frame = Frame(
        frame_id="F0",
        rgb_bytes=arr.tobytes(),
        rgb_shape=(4, 4, 3),
        rgb_dtype="uint8",
        exif_orientation=1,
        captured_at=datetime.now(timezone.utc),
        decoding_failed=False,
    )
    failed_frame = Frame(
        frame_id="F-bad",
        rgb_bytes=b"",
        rgb_shape=(0, 0, 3),
        decoding_failed=True,
    )
    mock_ollama.generate.return_value = {"name": "x"}
    obs = _scene(1)
    await classification_refine_impl(
        obs,
        frames=[failed_frame, frame],
        ollama=mock_ollama,
        config=PipelineConfig(),
    )
    sent = mock_ollama.generate.call_args.kwargs["images"]
    assert isinstance(sent, list) and len(sent) == 1
    payload = sent[0]
    assert isinstance(payload, bytes) and len(payload) > 0, (
        "frame bytes must be threaded through; b'' breaks parity"
    )
    # Sanity: the payload should be a valid JPEG (Ollama expects this).
    Image.open(BytesIO(payload)).load()


@pytest.mark.asyncio
async def test_concurrent_calls_serialised_via_ollama_semaphore() -> None:
    """When two refine ops run concurrently against the SAME model, the real
    OllamaClient's per-model semaphore must serialise them. We use a fake
    OllamaClient that mimics the semaphore behaviour and assert peak in-flight
    is 1.
    """
    in_flight = 0
    peak = 0
    sem = asyncio.Semaphore(1)

    async def fake_generate(**_kwargs: Any) -> dict[str, Any]:
        nonlocal in_flight, peak
        async with sem:
            in_flight += 1
            peak = max(peak, in_flight)
            await asyncio.sleep(0.01)
            in_flight -= 1
            return {"name": "x"}

    fake = AsyncMock(spec=OllamaClient)
    fake.generate.side_effect = fake_generate

    obs_a = _scene(2)
    obs_b = _scene(2)
    cfg = PipelineConfig()
    await asyncio.gather(
        classification_refine_impl(obs_a, ollama=fake, config=cfg),
        classification_refine_impl(obs_b, ollama=fake, config=cfg),
    )
    assert peak == 1


# ---------------------------------------------------------------------------
# _dedupe_by_type — post-classification same-type dedup
# ---------------------------------------------------------------------------


def _det(
    det_id: str,
    primary: str,
    bbox: BBox,
    *,
    signals: list[ContributingSignal] | None = None,
    alts: list[AlternateLabel] | None = None,
) -> PipelineDetection:
    return PipelineDetection(
        id=det_id,
        bbox=bbox,
        primaryLabel=primary,
        contributingSignals=signals or [],
        alternateLabels=alts or [],
    )


def test_dedupe_merges_same_type_when_iou_above_threshold() -> None:
    """Three detections all labelled "coffee table" with overlapping
    bboxes (IoU ≥ 0.5) collapse to one — the classic post-classification
    duplicate from florence + gdino + gdino-sahi all spotting the same
    object."""
    a = _det(
        "a", "coffee table", BBox(x=0, y=0, width=100, height=100),
        signals=[ContributingSignal(detector="florence", frameId="F0", rawConfidence=None)],
    )
    b = _det(
        "b", "coffee table", BBox(x=10, y=10, width=100, height=100),
        signals=[ContributingSignal(detector="gdino", frameId="F0", rawConfidence=0.4)],
    )
    c = _det(
        "c", "coffee table", BBox(x=5, y=5, width=100, height=100),
        signals=[ContributingSignal(detector="gdino-sahi", frameId="F0", rawConfidence=0.35)],
    )
    out = _dedupe_by_type([a, b, c])
    assert len(out) == 1
    detectors = {s.detector for s in out[0].contributingSignals}
    assert detectors == {"florence", "gdino", "gdino-sahi"}


def test_dedupe_keeps_distinct_locations() -> None:
    """Two "lamp" detections in different parts of the room (no bbox
    overlap) must NOT be merged — that's two real lamps, not a duplicate."""
    a = _det("a", "lamp", BBox(x=0, y=0, width=50, height=50))
    b = _det("b", "lamp", BBox(x=200, y=200, width=50, height=50))
    out = _dedupe_by_type([a, b])
    assert len(out) == 2


def test_dedupe_does_not_cross_type_boundaries() -> None:
    """A "coffee table" and a "side table" with overlapping boxes are
    different items — different ``primaryLabel`` blocks the merge."""
    a = _det("a", "coffee table", BBox(x=0, y=0, width=100, height=100))
    b = _det("b", "side table", BBox(x=10, y=10, width=100, height=100))
    out = _dedupe_by_type([a, b])
    assert len(out) == 2


def test_dedupe_unions_alternate_labels() -> None:
    """When two same-type boxes merge, alternateLabels from the loser
    join the survivor's (case-insensitive dedup, primary excluded)."""
    a = _det(
        "a", "coffee table", BBox(x=0, y=0, width=100, height=100),
        signals=[ContributingSignal(detector="florence", frameId="F0", rawConfidence=None)],
        alts=[AlternateLabel(label="furniture", confidence=0.85)],
    )
    b = _det(
        "b", "coffee table", BBox(x=10, y=10, width=100, height=100),
        signals=[ContributingSignal(detector="gdino", frameId="F0", rawConfidence=0.4)],
        alts=[
            AlternateLabel(label="marble", confidence=0.80),
            AlternateLabel(label="FURNITURE", confidence=0.85),  # case-dup of survivor's
        ],
    )
    out = _dedupe_by_type([a, b])
    assert len(out) == 1
    labels = [a.label for a in out[0].alternateLabels]
    assert "furniture" in labels
    assert "marble" in labels
    # Case-duplicate should not be added a second time.
    assert sum(1 for l in labels if l.casefold() == "furniture") == 1


def test_dedupe_picks_survivor_with_most_signals() -> None:
    """Survivor selection: most contributingSignals wins, ties broken by
    largest area, then lexicographic id."""
    # Boxes are 20×20, offset by 2 → IoU ≈ 0.68, well above the 0.5 cutoff.
    weak = _det(
        "z-id", "lamp", BBox(x=0, y=0, width=20, height=20),
        signals=[ContributingSignal(detector="gdino", frameId="F0", rawConfidence=0.3)],
    )
    strong = _det(
        "a-id", "lamp", BBox(x=2, y=2, width=20, height=20),
        signals=[
            ContributingSignal(detector="florence", frameId="F0", rawConfidence=None),
            ContributingSignal(detector="gdino", frameId="F0", rawConfidence=0.5),
        ],
    )
    out = _dedupe_by_type([weak, strong])
    assert len(out) == 1
    assert out[0].id == "a-id"  # strong wins on signal count


def test_dedupe_preserves_singletons() -> None:
    """Detections with unique types pass through untouched."""
    a = _det("a", "lamp", BBox(x=0, y=0, width=10, height=10))
    b = _det("b", "rug", BBox(x=20, y=20, width=10, height=10))
    out = _dedupe_by_type([a, b])
    assert {d.id for d in out} == {"a", "b"}


def test_dedupe_empty_input_returns_empty() -> None:
    assert _dedupe_by_type([]) == []


def test_dedupe_merges_when_smaller_box_contained_in_larger() -> None:
    """Real failure mode from the bedroom photo: Grounding DINO emitted
    a near-whole-frame "coffee table" box (905K area) and Florence
    emitted a tight one (180K area). IoU ≈ 0.20 (low because of the size
    mismatch) but containment of the smaller inside the larger is ≈
    0.99 — they're the same object. Must collapse."""
    tight = _det(
        "tight", "coffee table",
        BBox(x=1, y=387, width=512, height=351),  # area 179_712
        signals=[ContributingSignal(detector="florence", frameId="F0", rawConfidence=None)],
    )
    oversized = _det(
        "oversized", "coffee table",
        BBox(x=3, y=6, width=714, height=1267),   # area 904_938
        signals=[ContributingSignal(detector="gdino", frameId="F0", rawConfidence=0.32)],
    )
    out = _dedupe_by_type([tight, oversized])
    assert len(out) == 1
    detectors = {s.detector for s in out[0].contributingSignals}
    assert detectors == {"florence", "gdino"}


def test_dedupe_does_not_merge_neighbouring_objects() -> None:
    """Two pillows side-by-side with non-overlapping boxes (IoU=0,
    containment=0) must stay separate even though they share a
    primaryLabel — they're different physical pillows."""
    p1 = _det("p1", "pillow", BBox(x=42, y=351, width=162, height=117))
    p2 = _det("p2", "pillow", BBox(x=236, y=362, width=192, height=126))
    out = _dedupe_by_type([p1, p2])
    assert len(out) == 2
