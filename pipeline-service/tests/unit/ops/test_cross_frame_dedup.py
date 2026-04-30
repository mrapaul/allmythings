"""§3.11 cross_frame_dedup tests."""
from __future__ import annotations

import numpy as np

from pipeline_service.ops.cross_frame_dedup import cross_frame_dedup_impl
from pipeline_service.types import (
    BBox,
    ContributingSignal,
    DedupedFrame,
    EmbeddedFrame,
    FusedDetection,
)


def _det(det_id: str, frame_id: str, label: str = "lamp", x: float = 0, y: float = 0) -> FusedDetection:
    return FusedDetection(
        detection_id=det_id,
        frame_id=frame_id,
        bbox=BBox(x=x, y=y, width=30, height=30),
        primary_label=label,
        contributing_signals=[
            ContributingSignal(detector="florence", frameId=frame_id, rawConfidence=None)
        ],
    )


def _normed_vec(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    v = rng.standard_normal(768).astype(np.float32)
    return v / np.linalg.norm(v)


def _embed_frame(frame_id: str, mapping: dict[str, np.ndarray]) -> EmbeddedFrame:
    return EmbeddedFrame(
        frame_id=frame_id,
        embeddings={
            det_id: vec.astype(np.float16).tobytes() for det_id, vec in mapping.items()
        },
    )


def test_three_frames_same_object_merge_into_one() -> None:
    same = _normed_vec(42)
    deduped = [
        DedupedFrame(frame_id="F0", detections=[_det("d-F0", "F0", "lamp")]),
        DedupedFrame(frame_id="F1", detections=[_det("d-F1", "F1", "lamp")]),
        DedupedFrame(frame_id="F2", detections=[_det("d-F2", "F2", "lamp")]),
    ]
    embedded = [
        _embed_frame("F0", {"d-F0": same}),
        _embed_frame("F1", {"d-F1": same}),
        _embed_frame("F2", {"d-F2": same}),
    ]
    out = cross_frame_dedup_impl(deduped, embedded, scene_id="s", run_id="r")
    assert len(out.detections) == 1
    sigs = out.detections[0].contributingSignals
    frame_ids = {s.frameId for s in sigs}
    assert frame_ids == {"F0", "F1", "F2"}


def test_three_frames_different_objects_no_merges() -> None:
    deduped = [
        DedupedFrame(frame_id="F0", detections=[_det("d-F0", "F0", "lamp")]),
        DedupedFrame(frame_id="F1", detections=[_det("d-F1", "F1", "chair")]),
        DedupedFrame(frame_id="F2", detections=[_det("d-F2", "F2", "table")]),
    ]
    embedded = [
        _embed_frame("F0", {"d-F0": _normed_vec(1)}),
        _embed_frame("F1", {"d-F1": _normed_vec(2)}),
        _embed_frame("F2", {"d-F2": _normed_vec(3)}),
    ]
    out = cross_frame_dedup_impl(deduped, embedded, scene_id="s", run_id="r")
    assert len(out.detections) == 3


def test_label_text_compat_blocks_cross_frame_merge() -> None:
    """Same crop embedding but incompatible labels (plant vs vase) → no merge."""
    same = _normed_vec(42)
    deduped = [
        DedupedFrame(frame_id="F0", detections=[_det("d-F0", "F0", "plant")]),
        DedupedFrame(frame_id="F1", detections=[_det("d-F1", "F1", "vase")]),
    ]
    embedded = [
        _embed_frame("F0", {"d-F0": same}),
        _embed_frame("F1", {"d-F1": same}),
    ]
    out = cross_frame_dedup_impl(deduped, embedded, scene_id="s", run_id="r")
    assert len(out.detections) == 2


def test_same_frame_pairs_never_merged_here() -> None:
    """Two detections in the same frame: cross_frame_dedup must NOT merge
    them, even if cosine + labels match. cross_pass_dedup is for that."""
    same = _normed_vec(42)
    deduped = [
        DedupedFrame(
            frame_id="F0",
            detections=[
                _det("d1", "F0", "lamp", x=0),
                _det("d2", "F0", "lamp", x=200),
            ],
        ),
    ]
    embedded = [_embed_frame("F0", {"d1": same, "d2": same})]
    out = cross_frame_dedup_impl(deduped, embedded, scene_id="s", run_id="r")
    assert len(out.detections) == 2


def test_embedding_unavailable_detection_still_emitted() -> None:
    """Detections without crop embeddings skip FAISS but are still emitted."""
    deduped = [
        DedupedFrame(frame_id="F0", detections=[_det("d-noemb", "F0", "lamp")]),
        DedupedFrame(frame_id="F1", detections=[_det("d-emb", "F1", "lamp")]),
    ]
    embedded = [
        EmbeddedFrame(frame_id="F0", embeddings={}),
        _embed_frame("F1", {"d-emb": _normed_vec(99)}),
    ]
    out = cross_frame_dedup_impl(deduped, embedded, scene_id="s", run_id="r")
    ids = {d.id for d in out.detections}
    assert "d-noemb" in ids
    assert "d-emb" in ids


def test_faiss_index_per_run_only() -> None:
    """Two successive calls must not share index state."""
    same = _normed_vec(42)
    deduped = [
        DedupedFrame(frame_id="F0", detections=[_det("d1", "F0", "lamp")]),
    ]
    embedded = [_embed_frame("F0", {"d1": same})]
    out_a = cross_frame_dedup_impl(deduped, embedded, scene_id="A", run_id="r1")
    out_b = cross_frame_dedup_impl(deduped, embedded, scene_id="B", run_id="r2")
    # Both produce one detection; the second wasn't poisoned by the first.
    assert len(out_a.detections) == 1
    assert len(out_b.detections) == 1


def test_empty_input_returns_empty_observation() -> None:
    out = cross_frame_dedup_impl([], [], scene_id="s", run_id="r")
    assert out.detections == []
    assert out.agreementCoverage == 0.0
    assert out.agreementPrecision == 0.0


def test_deterministic_output_ordering() -> None:
    """Output is sorted (primary_label, frame_id, detection_id)."""
    deduped = [
        DedupedFrame(
            frame_id="F1",
            detections=[
                _det("d-1", "F1", "z-label"),
                _det("d-2", "F1", "a-label"),
            ],
        ),
    ]
    embedded = [_embed_frame("F1", {"d-1": _normed_vec(1), "d-2": _normed_vec(2)})]
    out = cross_frame_dedup_impl(deduped, embedded, scene_id="s", run_id="r")
    labels = [d.primaryLabel for d in out.detections]
    assert labels == sorted(labels)
