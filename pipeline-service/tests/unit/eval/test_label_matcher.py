"""Tests for ``LabelMatcher`` Protocol and ``CosineLabelMatcher``.

Embedding-cosine semantics are tested by *constructing* embedding vectors
that achieve a chosen cosine value (rather than depending on the actual
sentence-transformer model). For each sentinel pair we override the
mock encoder's ``encode`` to return two unit vectors with cosine equal
to the documented expectation.

This makes the tests deterministic, fast, and independent of the
encoder version.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

from pipeline_service.eval.gt_eval.matchers.label_cosine import CosineLabelMatcher
from pipeline_service.eval.gt_eval.matchers.protocol import LabelMatcher


# ---------- helpers --------------------------------------------------------


def _vectors_with_cosine(target: float, dim: int = 8) -> tuple[np.ndarray, np.ndarray]:
    """Build two unit vectors in dim-D space with the given cosine."""
    target = max(-1.0, min(1.0, target))
    v_a = np.zeros(dim, dtype=np.float32)
    v_a[0] = 1.0
    v_b = np.zeros(dim, dtype=np.float32)
    v_b[0] = float(target)
    v_b[1] = float(math.sqrt(max(0.0, 1.0 - target * target)))
    return v_a, v_b


def _make_pair_encoder(pair_to_cosine: dict[tuple[str, str], float]):
    """Return a side_effect for ``encode`` driven by a (pred, gt)->cosine table.

    The encoder is queried twice per pair (once for predicted, once for gt).
    To produce a cosine of c between the two, return v_a on the first
    encode of any pair-member and v_b on the second. We keep state in a
    dict keyed by string.
    """
    cache: dict[str, np.ndarray] = {}
    pair_lookup: dict[frozenset[str], float] = {
        frozenset({CosineLabelMatcher._normalise(p), CosineLabelMatcher._normalise(g)}): c
        for (p, g), c in pair_to_cosine.items()
    }

    def _encode(text: str) -> np.ndarray:
        if text in cache:
            return cache[text]
        # Find the pair this string belongs to and which "side" we're on.
        for pair, cos in pair_lookup.items():
            if text in pair:
                v_a, v_b = _vectors_with_cosine(cos)
                # Assign deterministically: the "smaller" (lexicographically) of the
                # two pair members gets v_a, the other v_b.
                a_text, b_text = sorted(pair)
                cache[a_text] = v_a
                cache[b_text] = v_b
                return cache[text]
        # Unknown text — return an orthogonal random-ish vector (cosine ≈ 0).
        rng = np.random.default_rng(abs(hash(text)) % (2**32))
        v = rng.standard_normal(8).astype(np.float32)
        v = v / (np.linalg.norm(v) + 1e-9)
        cache[text] = v
        return v

    return _encode


def _empty_aliases(tmp_path: Path) -> Path:
    p = tmp_path / "lvis_aliases.json"
    p.write_text("{}")
    return p


# ---------- Protocol -------------------------------------------------------


class TestLabelMatcherProtocol:
    def test_protocol_is_runtime_checkable(self) -> None:
        class _OK:
            def __call__(self, predicted: str, gt_category: str) -> bool:
                return predicted == gt_category

        assert isinstance(_OK(), LabelMatcher)

    def test_missing_method_rejected(self) -> None:
        class _NoCall:
            pass

        assert not isinstance(_NoCall(), LabelMatcher)


# ---------- Identical / normalisation ---------------------------------------


class TestCosineLabelMatcherIdentical:
    def test_identical_strings_short_circuit(
        self, tmp_path: Path, mock_label_encoder
    ) -> None:
        matcher = CosineLabelMatcher(
            encoder=mock_label_encoder,
            threshold=0.6,
            aliases_path=_empty_aliases(tmp_path),
        )
        assert matcher("couch", "couch") is True
        # Encoder must NOT be invoked.
        assert mock_label_encoder.encode.call_count == 0

    def test_identical_after_normalise(
        self, tmp_path: Path, mock_label_encoder
    ) -> None:
        matcher = CosineLabelMatcher(
            encoder=mock_label_encoder,
            threshold=0.6,
            aliases_path=_empty_aliases(tmp_path),
        )
        assert matcher("  Couch ", "couch") is True
        assert mock_label_encoder.encode.call_count == 0

    def test_normalisation_strips_underscores(
        self, tmp_path: Path, mock_label_encoder
    ) -> None:
        matcher = CosineLabelMatcher(
            encoder=mock_label_encoder,
            threshold=0.6,
            aliases_path=_empty_aliases(tmp_path),
        )
        assert matcher("side_table", "side table") is True
        assert mock_label_encoder.encode.call_count == 0


# ---------- Calibration sentinels ------------------------------------------


_OBVIOUS_POSITIVE_PAIRS: list[tuple[str, str]] = [
    ("couch", "sofa"),
    ("tv", "television"),
    ("refrigerator", "fridge"),
    ("car", "automobile"),
    ("kitchen", "cooking area"),
    ("rug", "carpet"),
    ("bottle", "flask"),
    ("cup", "mug"),
    ("light bulb", "lightbulb"),
    ("cushion", "pillow"),
    ("microwave", "microwave oven"),
    ("dining table", "dining_table"),
    ("vacuum", "vacuum cleaner"),
    ("painting", "artwork"),
    ("mirror", "looking glass"),
]

_BORDERLINE_POSITIVE_PAIRS: list[tuple[str, str]] = [
    ("marble side table", "side_table"),
    ("sectional", "couch"),
    ("recliner", "armchair"),
    ("bookcase", "bookshelf"),
    ("ottoman", "footstool"),
    ("chandelier", "lamp"),
    ("fan", "ceiling fan"),
    ("sconce", "wall light"),
    ("blender", "mixer"),
    ("toaster", "toaster oven"),
    ("dresser", "chest of drawers"),
    ("nightstand", "bedside table"),
    ("blinds", "curtains"),
    ("kettle", "tea kettle"),
    ("vase", "flower pot"),
]

_OBVIOUS_NEGATIVE_PAIRS: list[tuple[str, str]] = [
    ("couch", "refrigerator"),
    ("lamp", "bookshelf"),
    ("mirror", "blender"),
    ("rug", "ceiling fan"),
    ("bottle", "armchair"),
    ("kettle", "painting"),
    ("microwave", "curtains"),
    ("toaster", "ottoman"),
    ("vase", "tv"),
    ("cushion", "blender"),
    ("light bulb", "carpet"),
    ("dresser", "kettle"),
    ("vacuum", "mirror"),
    ("nightstand", "toaster"),
    ("painting", "fridge"),
]

_HARD_NEGATIVE_PAIRS: list[tuple[str, str]] = [
    ("table", "chair"),
    ("lamp", "lampshade"),
    ("door", "window"),
    ("bowl", "plate"),
    ("desk", "chair"),
]

_CROSS_LANGUAGE_PAIRS: list[tuple[str, str, bool]] = [
    # Mixed-language sentinels. ``expected`` is the orchestrator's expectation
    # at threshold=0.6. The cosine values are chosen so that this expectation
    # is met under the constructed-vector setup; any drift in the future
    # belongs in lvis_aliases.json, not in the matcher code.
    ("bank", "couch", True),         # NL bank == EN couch
    ("koelkast", "refrigerator", True),
    ("stoel", "chair", True),
    ("lamp", "lamp", True),          # same word in both languages
    ("tafel", "table", True),
    ("kast", "wardrobe", True),
    ("auto", "car", True),
    ("hond", "couch", False),        # NL "dog" — orthogonal to couch
    ("kop", "cup", True),
    ("plant", "fridge", False),
]


class TestCosineLabelMatcherCalibration:
    def test_obvious_positives(
        self, tmp_path: Path, mock_label_encoder
    ) -> None:
        table = {p: 0.9 for p in _OBVIOUS_POSITIVE_PAIRS}
        mock_label_encoder.encode.side_effect = _make_pair_encoder(table)
        matcher = CosineLabelMatcher(
            encoder=mock_label_encoder,
            threshold=0.6,
            aliases_path=_empty_aliases(tmp_path),
        )
        for pred, gt in _OBVIOUS_POSITIVE_PAIRS:
            assert matcher(pred, gt) is True, (pred, gt)

    def test_borderline_positives(
        self, tmp_path: Path, mock_label_encoder
    ) -> None:
        table = {p: 0.65 for p in _BORDERLINE_POSITIVE_PAIRS}
        mock_label_encoder.encode.side_effect = _make_pair_encoder(table)
        matcher = CosineLabelMatcher(
            encoder=mock_label_encoder,
            threshold=0.6,
            aliases_path=_empty_aliases(tmp_path),
        )
        for pred, gt in _BORDERLINE_POSITIVE_PAIRS:
            assert matcher(pred, gt) is True, (pred, gt)

    def test_obvious_negatives(
        self, tmp_path: Path, mock_label_encoder
    ) -> None:
        table = {p: 0.2 for p in _OBVIOUS_NEGATIVE_PAIRS}
        mock_label_encoder.encode.side_effect = _make_pair_encoder(table)
        matcher = CosineLabelMatcher(
            encoder=mock_label_encoder,
            threshold=0.6,
            aliases_path=_empty_aliases(tmp_path),
        )
        for pred, gt in _OBVIOUS_NEGATIVE_PAIRS:
            assert matcher(pred, gt) is False, (pred, gt)

    def test_hard_negatives_near_threshold(
        self, tmp_path: Path, mock_label_encoder
    ) -> None:
        table = {p: 0.58 for p in _HARD_NEGATIVE_PAIRS}
        mock_label_encoder.encode.side_effect = _make_pair_encoder(table)
        matcher = CosineLabelMatcher(
            encoder=mock_label_encoder,
            threshold=0.6,
            aliases_path=_empty_aliases(tmp_path),
        )
        for pred, gt in _HARD_NEGATIVE_PAIRS:
            assert matcher(pred, gt) is False, (pred, gt)

    def test_cross_language_synonyms(
        self, tmp_path: Path, mock_label_encoder
    ) -> None:
        table: dict[tuple[str, str], float] = {}
        for pred, gt, expected in _CROSS_LANGUAGE_PAIRS:
            table[(pred, gt)] = 0.7 if expected else 0.2
        mock_label_encoder.encode.side_effect = _make_pair_encoder(table)
        matcher = CosineLabelMatcher(
            encoder=mock_label_encoder,
            threshold=0.6,
            aliases_path=_empty_aliases(tmp_path),
        )
        for pred, gt, expected in _CROSS_LANGUAGE_PAIRS:
            actual = matcher(pred, gt)
            assert actual is expected, (pred, gt, expected, actual)


# ---------- Robustness -----------------------------------------------------


class TestCosineLabelMatcherRobustness:
    def test_encoder_failure_returns_true(
        self, tmp_path: Path, mock_label_encoder
    ) -> None:
        mock_label_encoder.encode.side_effect = RuntimeError("boom")
        matcher = CosineLabelMatcher(
            encoder=mock_label_encoder,
            threshold=0.6,
            aliases_path=_empty_aliases(tmp_path),
        )
        # Different strings — would normally go through the encoder. Failure -> True.
        assert matcher("couch", "fridge") is True

    def test_alias_map_override_skips_encoder(
        self, tmp_path: Path, mock_label_encoder
    ) -> None:
        aliases = tmp_path / "lvis_aliases.json"
        aliases.write_text(json.dumps({"tv stand": "entertainment_center"}))
        matcher = CosineLabelMatcher(
            encoder=mock_label_encoder, threshold=0.6, aliases_path=aliases
        )
        assert matcher("tv stand", "entertainment_center") is True
        assert mock_label_encoder.encode.call_count == 0

    def test_alias_map_missing_file_is_empty(
        self, tmp_path: Path, mock_label_encoder
    ) -> None:
        missing = tmp_path / "does_not_exist.json"
        # Force cosine 0.9 so the matcher returns True via the encoder path.
        mock_label_encoder.encode.side_effect = _make_pair_encoder(
            {("couch", "sofa"): 0.9}
        )
        matcher = CosineLabelMatcher(
            encoder=mock_label_encoder, threshold=0.6, aliases_path=missing
        )
        assert matcher("couch", "sofa") is True

    def test_threshold_parameter_override(
        self, tmp_path: Path, mock_label_encoder
    ) -> None:
        mock_label_encoder.encode.side_effect = _make_pair_encoder(
            {("sectional", "couch"): 0.62}
        )
        m_lo = CosineLabelMatcher(
            encoder=mock_label_encoder,
            threshold=0.6,
            aliases_path=_empty_aliases(tmp_path),
        )
        assert m_lo("sectional", "couch") is True

        # Reset encoder cache via a new mock so vectors get rebuilt.
        mock_label_encoder.encode.side_effect = _make_pair_encoder(
            {("sectional", "couch"): 0.62}
        )
        m_hi = CosineLabelMatcher(
            encoder=mock_label_encoder,
            threshold=0.95,
            aliases_path=_empty_aliases(tmp_path),
        )
        assert m_hi("sectional", "couch") is False
