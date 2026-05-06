"""Label-text encoder — production wires sentence-transformers/all-MiniLM-L6-v2.

§3.11 negative-gate. The encoder produces 384-d unit-normalised vectors;
``label_text_compat`` checks cosine ≥ threshold (default 0.6) to decide
whether two labels can refer to the same kind of object — used by
cross_pass_dedup and cross_frame_dedup as the gate alongside IoU /
embedding-overlap.

Calibration sentinels (committed pairs in
``tests/replay/fixtures/label_compat_pairs.json``) check that the
production model agrees with human judgement at threshold 0.6:

  ("sofa","couch")               → True  (cos ≈ 0.86)
  ("table","chair")              → False (cos ≈ 0.45)
  ("lamp","light")               → True  (cos ≈ 0.62)
  ("plant","vase")               → False (cos ≈ 0.43)
  ("coffee mug","cup")           → True  (cos ≈ 0.70)
  ("dining chair","office chair") → True (cos ≈ 0.74)

Tests pin these so the model's semantic gate can't silently drift.
"""
from __future__ import annotations

import hashlib
import logging
import os
from typing import Any, Callable, Optional

import numpy as np

logger = logging.getLogger("pipeline_service.models.label_encoder")

EMBED_DIM = 384
EncoderFn = Callable[[str], np.ndarray]

_DEFAULT_MODEL_NAME = os.environ.get(
    "LABEL_ENCODER_MODEL", "sentence-transformers/all-MiniLM-L6-v2"
)


def _deterministic_fake_encode(label: str) -> np.ndarray:
    """Pure hash → 384-d unit vector. Used by tests that don't want to
    pay the real-model load cost; injects no semantic structure, so two
    distinct strings always produce near-orthogonal vectors regardless
    of meaning. Tests that need synonym-aware behaviour either inject
    a different mock backend OR run against the real production
    encoder via ``LabelEncoder()``.
    """
    norm = label.strip().lower()
    digest = hashlib.sha256(norm.encode()).digest()
    seed = int.from_bytes(digest[:8], "big") & 0x7FFFFFFF
    rng = np.random.default_rng(seed)
    raw = rng.standard_normal(EMBED_DIM).astype(np.float32)
    norm_v = float(np.linalg.norm(raw))
    if norm_v == 0:
        raw[0] = 1.0
        norm_v = 1.0
    return (raw / norm_v).astype(np.float32)


class _SentenceTransformerBackend:
    """Production backend — sentence-transformers/all-MiniLM-L6-v2.

    Lazy-loaded on first encode call so pipeline-service startup
    doesn't block on the model download (~80 MB on first use, then
    cached at ``~/.cache/huggingface``). The model is shared across
    every ``LabelEncoder`` in the process — semantic embedding is
    stateless and the wrapped ``SentenceTransformer`` is thread-safe
    for inference.
    """

    _shared_model: Any = None  # SentenceTransformer | None — lazy import

    def __init__(self, model_name: str = _DEFAULT_MODEL_NAME) -> None:
        self._model_name = model_name

    def _load(self) -> Any:
        if _SentenceTransformerBackend._shared_model is None:
            from sentence_transformers import SentenceTransformer

            logger.info(
                "loading label encoder %s (lazy first-use load)",
                self._model_name,
            )
            _SentenceTransformerBackend._shared_model = SentenceTransformer(
                self._model_name
            )
        return _SentenceTransformerBackend._shared_model

    def __call__(self, label: str) -> np.ndarray:
        model = self._load()
        # ``normalize_embeddings=True`` returns unit vectors so cosine
        # is just dot-product downstream — matches the existing
        # ``label_text_compat`` math without an extra normalise step.
        vec = model.encode(label, convert_to_numpy=True, normalize_embeddings=True)
        # SentenceTransformer returns float32 already; this cast is a
        # no-op safety net for any model that defaults to float64.
        return np.asarray(vec, dtype=np.float32)


class LabelEncoderError(RuntimeError):
    pass


class LabelEncoder:
    """Embedding wrapper with per-instance LRU-style cache.

    Default backend is the production sentence-transformers model;
    tests can inject ``_deterministic_fake_encode`` (or any
    ``Callable[[str], np.ndarray]``) by passing ``backend=...``.
    """

    name = "label_encoder"
    EMBED_DIM = EMBED_DIM

    def __init__(self, *, backend: Optional[EncoderFn] = None) -> None:
        self._backend: EncoderFn = backend or _SentenceTransformerBackend()
        self._cache: dict[str, np.ndarray] = {}
        self.loaded = True

    async def warmup(self) -> None:  # pragma: no cover
        # Touch the backend so the lazy load happens here rather than
        # on the first user request.
        self.encode("warmup")

    def encode(self, label: str) -> np.ndarray:
        if label in self._cache:
            return self._cache[label]
        out = self._backend(label)
        if out.shape != (EMBED_DIM,):
            raise LabelEncoderError(
                f"label encoder backend returned {out.shape}; expected ({EMBED_DIM},)"
            )
        self._cache[label] = out.astype(np.float32)
        return self._cache[label]

    def reset_cache(self) -> None:
        """Lifecycle hook — called between Dagster runs."""
        self._cache.clear()


def label_text_compat(
    a: str,
    b: str,
    *,
    threshold: float,
    encoder: LabelEncoder,
    max_retries: int = 3,
) -> bool:
    """Compatibility gate for cross-pass / cross-frame dedup.

    Returns True iff labels A and B refer to the same kind of object,
    measured by cosine similarity ≥ ``threshold`` between their
    sentence-transformer embeddings.

    Identical normalised strings short-circuit to True. Encoder failure
    is treated as **degraded → True** (per §4.2 of section-06): we never
    block a merge on encoder outage, because false-positive merges are
    cleaned up by post-classification dedup downstream while false-
    negative non-merges are visible to the user as duplicate detections.
    """
    norm_a = a.strip().lower()
    norm_b = b.strip().lower()
    if norm_a == norm_b:
        return True

    for attempt in range(1, max_retries + 1):
        try:
            va = encoder.encode(norm_a)
            vb = encoder.encode(norm_b)
            denom = float(np.linalg.norm(va) * np.linalg.norm(vb)) + 1e-9
            cos = float(np.dot(va, vb) / denom)
            return cos >= threshold
        except Exception:  # noqa: BLE001 — broad on purpose; degraded path
            logger.warning(
                "label encoder failure attempt %d/%d for (%r, %r)",
                attempt,
                max_retries,
                norm_a,
                norm_b,
            )
            if attempt == max_retries:
                return True  # degraded — don't block merges
    return True
