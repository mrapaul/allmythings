"""§3.10 cross_pass_dedup tests."""
from __future__ import annotations

import numpy as np

from pipeline_service.models.label_encoder import LabelEncoder
from pipeline_service.ops.cross_pass_dedup import cross_pass_dedup_impl
from pipeline_service.types import (
    BBox,
    ContributingSignal,
    EmbeddedFrame,
    FusedDetection,
    FusedFrame,
)


def _det(det_id: str, label: str = "lamp", x: float = 0, y: float = 0, w: float = 30, h: float = 30, n_signals: int = 1) -> FusedDetection:
    return FusedDetection(
        detection_id=det_id,
        frame_id="F0",
        bbox=BBox(x=x, y=y, width=w, height=h),
        primary_label=label,
        contributing_signals=[
            ContributingSignal(detector="florence", frameId=f"F{i}", rawConfidence=None)
            for i in range(n_signals)
        ],
    )


def _embeddings(*items: tuple[str, np.ndarray]) -> EmbeddedFrame:
    return EmbeddedFrame(
        frame_id="F0",
        embeddings={det_id: vec.astype(np.float16).tobytes() for det_id, vec in items},
    )


def test_merges_high_iou_with_compatible_labels() -> None:
    fused = FusedFrame(
        frame_id="F0",
        fused=[_det("d1", label="lamp"), _det("d2", label="light", x=2, y=2)],
    )
    out = cross_pass_dedup_impl(fused, EmbeddedFrame(frame_id="F0"))
    assert len(out.detections) == 1


def test_merges_high_cosine_with_compatible_labels() -> None:
    v = np.ones(768, dtype=np.float32)
    v = v / np.linalg.norm(v)
    fused = FusedFrame(
        frame_id="F0",
        fused=[
            _det("d1", label="lamp", x=0, y=0),
            _det("d2", label="light", x=200, y=200),  # no IoU
        ],
    )
    embeds = _embeddings(("d1", v), ("d2", v))
    out = cross_pass_dedup_impl(fused, embeds)
    assert len(out.detections) == 1


def test_does_not_merge_when_label_text_compat_blocks() -> None:
    """High IoU but incompatible labels (table vs chair) → must NOT merge."""
    fused = FusedFrame(
        frame_id="F0",
        fused=[
            _det("d1", label="table"),
            _det("d2", label="chair", x=2, y=2),
        ],
    )
    out = cross_pass_dedup_impl(fused, EmbeddedFrame(frame_id="F0"))
    # Negative gate blocks the merge.
    assert len(out.detections) == 2


def test_survivor_keeps_more_corroborated_detection() -> None:
    fused = FusedFrame(
        frame_id="F0",
        fused=[
            _det("d-low", label="lamp", n_signals=1),
            _det("d-high", label="light", n_signals=3, x=2, y=2),
        ],
    )
    out = cross_pass_dedup_impl(fused, EmbeddedFrame(frame_id="F0"))
    assert len(out.detections) == 1
    survivor = out.detections[0]
    assert survivor.detection_id == "d-high"
    # Discarded detection's signals appended.
    detectors = {s.frameId for s in survivor.contributing_signals}
    assert detectors == {"F0", "F1", "F2"}


def test_empty_input_returns_empty_dedupedframe() -> None:
    out = cross_pass_dedup_impl(
        FusedFrame(frame_id="F0", fused=[]), EmbeddedFrame(frame_id="F0")
    )
    assert out.detections == []


def test_non_overlapping_pass_through_unchanged() -> None:
    fused = FusedFrame(
        frame_id="F0",
        fused=[
            _det("d1", label="lamp", x=0, y=0),
            _det("d2", label="chair", x=500, y=500),
        ],
    )
    out = cross_pass_dedup_impl(fused, EmbeddedFrame(frame_id="F0"))
    assert len(out.detections) == 2


def test_label_encoder_failure_does_not_abort_op() -> None:
    """Encoder failure → label_text_compat returns True (degraded), op succeeds."""

    def boom(label: str) -> np.ndarray:
        raise RuntimeError("encoder dead")

    enc = LabelEncoder(backend=boom)
    fused = FusedFrame(
        frame_id="F0",
        fused=[
            _det("d1", label="something"),
            _det("d2", label="another", x=2, y=2),
        ],
    )
    out = cross_pass_dedup_impl(
        fused, EmbeddedFrame(frame_id="F0"), encoder=enc
    )
    # Op succeeds (no exception).  With degraded label_compat=True and
    # high IoU, the two get merged.
    assert len(out.detections) == 1
