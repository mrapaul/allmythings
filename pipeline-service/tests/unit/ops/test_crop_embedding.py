"""§3.9 crop_embedding — DINOv2 + int8 quantisation."""
from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
import pytest

from pipeline_service.models.dinov2 import DinoV2Loader
from pipeline_service.ops.crop_embedding import (
    crop_embedding_impl,
    dequantise_int8,
    quantise_to_int8,
)
from pipeline_service.types import (
    BBox,
    ContributingSignal,
    Frame,
    FusedDetection,
    FusedFrame,
)


def _frame() -> Frame:
    arr = np.zeros((400, 400, 3), dtype=np.uint8)
    # Inject a colored region so different bboxes give different crops.
    arr[100:200, 100:200, :] = 200
    arr[250:350, 250:350, :] = 80
    return Frame(
        frame_id="F0",
        rgb_bytes=arr.tobytes(),
        rgb_shape=(400, 400, 3),
        rgb_dtype="uint8",
        exif_orientation=1,
        captured_at=datetime.now(timezone.utc),
        decoding_failed=False,
    )


def _det(det_id: str, x: float = 100, y: float = 100, w: float = 100, h: float = 100) -> FusedDetection:
    return FusedDetection(
        detection_id=det_id,
        frame_id="F0",
        bbox=BBox(x=x, y=y, width=w, height=h),
        primary_label="lamp",
        contributing_signals=[
            ContributingSignal(detector="florence", frameId="F0", rawConfidence=None)
        ],
    )


def test_emits_768d_f16_normalised_per_box() -> None:
    fused = FusedFrame(frame_id="F0", fused=[_det("d1"), _det("d2", x=250, y=250)])
    out = crop_embedding_impl(_frame(), fused)
    assert set(out.embeddings.keys()) == {"d1", "d2"}
    for det_id, vec_bytes in out.embeddings.items():
        vec = np.frombuffer(vec_bytes, dtype=np.float16)
        assert vec.shape == (768,), det_id
        norm = float(np.linalg.norm(vec.astype(np.float32)))
        assert abs(norm - 1.0) < 1e-2


def test_int8_quantisation_round_trip_high_cosine() -> None:
    rng = np.random.default_rng(42)
    raw = rng.standard_normal(768).astype(np.float16)
    raw = (raw / np.linalg.norm(raw.astype(np.float32))).astype(np.float16)
    q = quantise_to_int8(raw)
    assert q.dtype == np.int8
    assert q.shape == (768,)
    dq = dequantise_int8(q)
    cos = float(
        np.dot(raw.astype(np.float32), dq.astype(np.float32))
        / (
            np.linalg.norm(raw.astype(np.float32))
            * np.linalg.norm(dq.astype(np.float32))
            + 1e-9
        )
    )
    assert cos >= 0.99


def test_int8_bytes_length_is_768() -> None:
    rng = np.random.default_rng(7)
    raw = rng.standard_normal(768).astype(np.float16)
    raw = (raw / np.linalg.norm(raw.astype(np.float32))).astype(np.float16)
    q = quantise_to_int8(raw)
    assert q.tobytes().__len__() == 768


def test_empty_fusedframe_returns_empty_embeddings() -> None:
    out = crop_embedding_impl(_frame(), FusedFrame(frame_id="F0", fused=[]))
    assert out.frame_id == "F0"
    assert out.embeddings == {}


def test_deterministic_same_input_same_output() -> None:
    """Replay-ability: same crop → byte-equal vector."""
    fused = FusedFrame(frame_id="F0", fused=[_det("d1")])
    a = crop_embedding_impl(_frame(), fused).embeddings["d1"]
    b = crop_embedding_impl(_frame(), fused).embeddings["d1"]
    assert a == b


def test_detection_ids_sorted_lexicographically() -> None:
    """Determinism guarantee: ids are sorted before embedding."""
    captured: list[str] = []

    class SpyEmbedder(DinoV2Loader):
        def embed(self, image_224: np.ndarray) -> np.ndarray:
            captured.append("called")
            return super().embed(image_224)

    fused = FusedFrame(
        frame_id="F0",
        fused=[_det("z"), _det("a"), _det("m")],
    )
    out = crop_embedding_impl(_frame(), fused, embedder=SpyEmbedder())
    # The output dict's insertion order should be a, m, z (sorted).
    assert list(out.embeddings.keys()) == ["a", "m", "z"]


def test_failed_embedding_excluded_from_output() -> None:
    """When the backend raises persistently for a crop, that detection's
    id is NOT in EmbeddedFrame.embeddings (per §3.9 — section-06 dedup
    excludes embedding-unavailable detections)."""

    class FlakyEmbedder(DinoV2Loader):
        def __init__(self) -> None:
            super().__init__()
            self.calls = 0

        def embed(self, image_224: np.ndarray) -> np.ndarray:
            self.calls += 1
            raise RuntimeError("kaboom")

    fused = FusedFrame(frame_id="F0", fused=[_det("d-bad"), _det("d-good", x=250, y=250)])

    # Embedder fails on first detection's call; subsequent calls also fail.
    bad = FlakyEmbedder()
    out = crop_embedding_impl(_frame(), fused, embedder=bad)
    assert "d-bad" not in out.embeddings
    assert "d-good" not in out.embeddings  # both fail per the spy


def test_resize_to_224() -> None:
    """The embedder is handed a 224×224×3 RGB crop."""
    seen: list[tuple] = []

    class ShapeSpy(DinoV2Loader):
        def embed(self, image_224: np.ndarray) -> np.ndarray:
            seen.append(image_224.shape)
            return super().embed(image_224)

    fused = FusedFrame(frame_id="F0", fused=[_det("d1")])
    crop_embedding_impl(_frame(), fused, embedder=ShapeSpy())
    assert seen == [(224, 224, 3)]
