"""§3.2 scene_embedding — DINOv2 ViT-B/14 (768-d float16 L2-normalised)."""
from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
import pytest

from pipeline_service.models.dinov2 import DimMismatchError, DinoV2Loader
from pipeline_service.ops.scene_embedding import scene_embedding_impl
from pipeline_service.types import Frame


def _frame(frame_id: str = "F0", colour: int = 100, decode_failed: bool = False) -> Frame:
    arr = np.full((224, 224, 3), colour, dtype=np.uint8)
    return Frame(
        frame_id=frame_id,
        rgb_bytes=arr.tobytes() if not decode_failed else b"",
        rgb_shape=(224, 224, 3) if not decode_failed else (0, 0, 3),
        rgb_dtype="uint8",
        exif_orientation=1,
        captured_at=datetime.now(timezone.utc),
        decoding_failed=decode_failed,
    )


def test_happy_path_emits_768d_f16_normalised() -> None:
    out = scene_embedding_impl([_frame("F0")])
    assert len(out) == 1
    se = out[0]
    assert not se.embedding_failed
    vec = np.frombuffer(se.vector_bytes, dtype=np.float16)
    assert vec.shape == (768,)
    norm = float(np.linalg.norm(vec.astype(np.float32)))
    assert abs(norm - 1.0) < 1e-3


def test_decoding_failed_frame_emits_embedding_failed() -> None:
    out = scene_embedding_impl([_frame("F0", decode_failed=True)])
    assert out[0].embedding_failed is True
    vec = np.frombuffer(out[0].vector_bytes, dtype=np.float16)
    assert vec.shape == (768,)
    assert float(np.linalg.norm(vec.astype(np.float32))) == 0.0


def test_per_frame_independence() -> None:
    out = scene_embedding_impl([
        _frame("F-good", colour=50),
        _frame("F-bad", decode_failed=True),
        _frame("F-also-good", colour=200),
    ])
    by_id = {se.frame_id: se for se in out}
    assert by_id["F-good"].embedding_failed is False
    assert by_id["F-bad"].embedding_failed is True
    assert by_id["F-also-good"].embedding_failed is False


def test_zero_vector_does_not_collide_with_real_vector() -> None:
    """The zero-vector flag must NOT alias onto any real-frame hash —
    regression for the §3.3 cache-poisoning bug.
    """
    real = scene_embedding_impl([_frame("F0", colour=42)])[0]
    failed = scene_embedding_impl([_frame("F-bad", decode_failed=True)])[0]
    assert real.vector_bytes != failed.vector_bytes


def test_runtime_dim_mismatch_raises() -> None:
    """If the embedder backend swaps to ViT-S/14 (384-d), the op trips."""
    bad = DinoV2Loader(backend=lambda crop: np.zeros(384, dtype=np.float16))
    with pytest.raises(DimMismatchError):
        scene_embedding_impl([_frame("F0")], embedder=bad)


def test_empty_input_returns_empty() -> None:
    assert scene_embedding_impl([]) == []


def test_centre_crop_is_224_square() -> None:
    """The op must hand the embedder a 224×224 RGB crop (centre square)."""
    seen: list[np.ndarray] = []

    def spy(crop: np.ndarray) -> np.ndarray:
        seen.append(crop)
        return np.zeros(768, dtype=np.float16)

    embedder = DinoV2Loader(backend=spy)
    big = np.zeros((400, 600, 3), dtype=np.uint8)
    big[100:324, 188:412, :] = 250  # marker the centre crop should pick up
    frame = Frame(
        frame_id="F0",
        rgb_bytes=big.tobytes(),
        rgb_shape=big.shape,  # type: ignore[arg-type]
        rgb_dtype="uint8",
        exif_orientation=1,
        captured_at=datetime.now(timezone.utc),
        decoding_failed=False,
    )
    scene_embedding_impl([frame], embedder=embedder)
    assert seen, "embedder backend must be called"
    crop = seen[0]
    assert crop.shape == (224, 224, 3)
    # Centre marker should dominate the crop (mean >> 0).
    assert crop.mean() > 100


def test_deterministic_same_input_same_output() -> None:
    """Replay-ability: same input frame → byte-equal vector."""
    frame_a = _frame("F0", colour=100)
    a = scene_embedding_impl([frame_a])[0]
    b = scene_embedding_impl([frame_a])[0]
    assert a.vector_bytes == b.vector_bytes
