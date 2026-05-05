Now I have all the context I need. Let me generate the section content for `section-03-matchers`.

# Section 03 — Matchers

## Purpose

Implement the `LabelMatcher` Protocol, the default `CosineLabelMatcher` implementation, and the IoU Hungarian-assignment `match_boxes` function. These primitives are consumed downstream by §05 metrics (mAP, label F1, hallucination detection).

## Dependencies

- **Depends on**: `section-01-foundation` — package skeleton at `pipeline-service/pipeline_service/eval/gt_eval/`, dependency declarations in `pyproject.toml` (`scipy>=1.13`, `numpy`), shared conftest fixtures (mock `LabelEncoder`).
- **Blocks**: `section-05-metrics` (mAP wrapper consumes `LabelMatcher`; label F1 + hallucination consume `match_boxes`), `section-08-orchestration` (uses both indirectly via metrics).
- **Parallelizable with**: `section-02-datasets`, `section-04-judges`, `section-07-pipeline-shim`.

## Files to Create

```
pipeline-service/pipeline_service/eval/gt_eval/matchers/
├── __init__.py            (created empty in §01; populate exports here)
├── protocol.py            (NEW — LabelMatcher Protocol)
├── label_cosine.py        (NEW — CosineLabelMatcher default impl)
└── iou.py                 (NEW — IoU + Hungarian assignment)

pipeline-service/tests/unit/eval/
├── test_label_matcher.py  (NEW)
└── test_iou_matcher.py    (NEW)
```

The `lvis_aliases.json` data file lives under `gt_eval/datasets/` and is owned by §02; this section only **reads** it (with a defensive missing-file fallback if §02 hasn't landed yet — empty dict).

## Background Context

The pipeline produces `PipelineDetection` objects with a `BBox` (xywh in pixel coordinates, top-left origin) and a free-text `label`. LVIS GT boxes are also pixel coords but expressed as xyxy (`GtBox` NamedTuple from §02: `x1, y1, x2, y2, category_id, category_name`).

Two distinct matching problems:

1. **Label matching** — does a free-text predicted label refer to the same concept as an LVIS category name? Used to decide whether a prediction enters the class-aware mAP pass and whether it's "correct" for label F1.
2. **Box matching** — given a list of predicted boxes and a list of GT boxes for one image, what is the optimal assignment under IoU ≥ threshold? Used for box-aware F1, hallucination identification (unmatched predictions are candidates), and to drive the per-image confusion matrix.

The label matcher is reused from production: `pipeline_service.models.label_encoder.LabelEncoder` is the existing `sentence-transformers/all-MiniLM-L6-v2` wrapper. **Do not modify** that module — wrap it.

## Tests First (TDD)

Write these tests **before** the implementation. Stubs and prose; the implementer fills in concrete fixture data.

### `tests/unit/eval/test_label_matcher.py`

```python
"""Tests for LabelMatcher Protocol + CosineLabelMatcher default impl."""

import pytest


class TestLabelMatcherProtocol:
    def test_protocol_is_runtime_checkable(self):
        """LabelMatcher is decorated @runtime_checkable; a callable with
        the right signature passes isinstance(obj, LabelMatcher)."""

    def test_missing_method_rejected(self):
        """A class without __call__(predicted, gt_category) -> bool fails
        isinstance check."""


class TestCosineLabelMatcher:
    def test_identical_strings_short_circuit(self, mock_label_encoder):
        """('couch', 'couch') returns True without calling encoder.encode().
        Case-insensitive trim: ('  Couch ', 'couch') also short-circuits."""

    def test_obvious_positives(self, mock_label_encoder):
        """15 sentinels with cosine >= 0.85 all return True at threshold=0.6.
        Pairs include: ('couch', 'sofa'), ('tv', 'television'),
        ('refrigerator', 'fridge'), ... (15 total)."""

    def test_borderline_positives(self, mock_label_encoder):
        """15 sentinels with cosine in [0.55, 0.7] return True at threshold=0.6.
        Pairs include: ('marble side table', 'side_table'),
        ('sectional', 'couch'), ... (15 total)."""

    def test_obvious_negatives(self, mock_label_encoder):
        """15 sentinels with cosine < 0.35 return False.
        Pairs include: ('couch', 'refrigerator'), ('lamp', 'bookshelf'),
        ... (15 total)."""

    def test_hard_negatives_near_threshold(self, mock_label_encoder):
        """5 sentinels with cosine in [0.55, 0.65] expected False at
        threshold=0.6 (i.e. just under). Pairs: ('table', 'chair'),
        ('lamp', 'lampshade'), ... (5 total)."""

    def test_cross_language_synonyms(self, mock_label_encoder):
        """10 EN<->NL household terms (mixed-language detection workload).
        Pairs: ('bank', 'couch') [NL bank=EN couch], ('koelkast',
        'refrigerator'), ... (10 total). Expected behaviour pinned per
        sentinel; document which the encoder gets right/wrong as
        calibration data."""

    def test_encoder_failure_returns_true(self, mock_label_encoder):
        """When mock_label_encoder.encode raises any Exception, the matcher
        returns True (degraded path — never block a match because the
        encoder is sick). Mirrors production label_text_compat."""

    def test_alias_map_override_skips_encoder(self, tmp_path,
                                              mock_label_encoder):
        """When lvis_aliases.json contains
        {'tv stand': 'entertainment_center'}, calling
        matcher('tv stand', 'entertainment_center') returns True without
        calling encode(). Verify by asserting encode call count == 0."""

    def test_alias_map_missing_file_is_empty(self, tmp_path,
                                             mock_label_encoder):
        """If lvis_aliases.json does not exist, alias map is treated as
        empty dict — matcher still works (falls through to cosine)."""

    def test_threshold_parameter_override(self, mock_label_encoder):
        """Borderline-positive pair ('sectional', 'couch') with cosine 0.62
        returns True at threshold=0.6 but False at threshold=0.95."""

    def test_normalisation_strips_punctuation_and_underscores(
        self, mock_label_encoder
    ):
        """('side_table', 'side table') short-circuits identical
        (underscore -> space, then case+trim normalised)."""
```

**Fixture notes**: `mock_label_encoder` is provided by the shared conftest (§01). It exposes `.encode(texts: list[str]) -> np.ndarray` and respects a per-pair cosine table you set in the test. Use it to pin deterministic cosine values without loading sentence-transformers.

### `tests/unit/eval/test_iou_matcher.py`

```python
"""Tests for IoU computation + Hungarian box assignment."""

import pytest


class TestIouComputation:
    def test_identical_boxes_iou_is_1(self):
        """iou(xyxy=(0,0,10,10), xyxy=(0,0,10,10)) == 1.0 exactly."""

    def test_touching_boxes_iou_is_0(self):
        """iou(xyxy=(0,0,10,10), xyxy=(10,0,20,10)) == 0.0.
        Pins the max-edge-exclusive convention."""

    def test_disjoint_boxes_iou_is_0(self):
        """iou(xyxy=(0,0,10,10), xyxy=(20,20,30,30)) == 0.0."""

    def test_known_iou_values(self):
        """Synthetic xyxy pairs at IoU exactly 0.4, 0.5, 0.6 (build with
        known intersection/union arithmetic). Each within 1e-9 of expected."""

    def test_pred_fully_inside_gt(self):
        """pred (5,5,10,10) fully inside gt (0,0,20,20) -> IoU = 25/400 =
        0.0625."""


class TestXywhToXyxy:
    def test_basic_conversion(self):
        """BBox(x=10, y=20, width=30, height=40) -> xyxy (10, 20, 40, 60).
        Max edges are exclusive (x+w, y+h)."""

    def test_zero_origin(self):
        """BBox(x=0, y=0, width=10, height=10) -> xyxy (0, 0, 10, 10)."""


class TestImageBoundClamping:
    def test_negative_origin_clamped(self):
        """BBox(x=-5, y=10, width=20, height=20) with image_width=100,
        image_height=100 -> xyxy (0, 10, 15, 30) after clamp."""

    def test_overflow_max_clamped(self):
        """BBox(x=90, y=90, width=20, height=20) with image_width=100,
        image_height=100 -> xyxy (90, 90, 100, 100) after clamp."""

    def test_fully_outside_becomes_zero_area(self):
        """BBox(x=200, y=200, width=10, height=10) with image_width=100,
        image_height=100 -> xyxy collapses to a zero-area box and is
        dropped by the zero-area filter (see next class)."""


class TestZeroAreaFilter:
    def test_zero_width_dropped(self):
        """A predicted box with width=0 is excluded from matching entirely
        — its index does NOT appear in the returned matches OR
        unmatched_pred_idxs (it's filtered before the assignment runs)."""

    def test_zero_height_dropped(self):
        """Same for height=0."""


class TestMatchBoxesHungarian:
    def test_empty_inputs(self):
        """match_boxes([], [], iou_threshold=0.5, image_width=100,
        image_height=100) -> ([], [], [])."""

    def test_no_predictions(self):
        """3 GT, 0 preds -> ([], [], [0, 1, 2])."""

    def test_no_ground_truths(self):
        """3 preds, 0 GT -> ([], [0, 1, 2], [])."""

    def test_simple_one_to_one(self):
        """1 pred at (0,0,10,10), 1 GT at (0,0,10,10), iou_threshold=0.5
        -> [Match(pred_idx=0, gt_idx=0, iou=1.0)], [], []."""

    def test_below_threshold_unmatched(self):
        """1 pred, 1 GT, IoU=0.3 with iou_threshold=0.5 ->
        ([], [0], [0])."""

    def test_hungarian_optimal_on_ambiguous_3x3(self):
        """3 preds A,B,C and 3 GTs 1,2,3. IoU matrix:
            iou(A,1)=0.80  iou(A,2)=0.70  iou(A,3)=0.00
            iou(B,1)=0.79  iou(B,2)=0.00  iou(B,3)=0.00
            iou(C,1)=0.00  iou(C,2)=0.00  iou(C,3)=0.85

        Greedy picks (A,1)=0.80, then B unmatched (no remaining GT with
        IoU>=0.5 except (B,1) already taken), then (C,3)=0.85 -> total 1.65.
        Hungarian picks (A,2)=0.70, (B,1)=0.79, (C,3)=0.85 -> total 2.34.
        Test pins Hungarian's optimal assignment."""

    def test_match_dataclass_is_frozen(self):
        """Match dataclass is frozen (cannot reassign pred_idx after
        construction)."""

    def test_scipy_unavailable_falls_back_to_greedy(self, monkeypatch):
        """When scipy.optimize.linear_sum_assignment import is patched to
        raise ImportError at module load, match_boxes uses a documented
        greedy fallback (descending IoU, first-fit). On the 3x3 ambiguous
        case, the greedy result is returned without crashing. A warning
        is logged at module load time."""

    def test_xywh_input_converts_internally(self):
        """match_boxes accepts the production BBox xywh shape (or the
        documented input type — see Implementation section). Input
        BBox(x=10, y=20, w=30, h=40) and a GtBox(x1=10, y1=20, x2=40,
        y2=60) match with IoU=1.0."""

    def test_clamping_applied_before_iou(self):
        """A pred at (-5, 10, w=20, h=20) on a 100x100 image is clamped
        to xyxy (0, 10, 15, 30) before IoU; if a GT is at xyxy
        (0, 10, 15, 30), the match succeeds with IoU=1.0."""
```

## Implementation

### `gt_eval/matchers/protocol.py`

Defines the `LabelMatcher` Protocol. Runtime-checkable so unit tests can `isinstance`-verify mock implementations.

```python
"""LabelMatcher Protocol — pluggable label-equivalence strategy."""
from __future__ import annotations
from typing import Protocol, runtime_checkable


@runtime_checkable
class LabelMatcher(Protocol):
    """Decides whether a free-text predicted label refers to the same
    concept as a dataset GT category name.

    Implementations must be pure (no I/O during __call__) once
    constructed. Construction-time I/O (loading aliases, encoders) is
    fine.
    """

    def __call__(self, predicted: str, gt_category: str) -> bool: ...
```

No public exports beyond `LabelMatcher`.

### `gt_eval/matchers/label_cosine.py`

Concrete default implementation. Wraps the existing
`pipeline_service.models.label_encoder.LabelEncoder` (sentence-transformers
`all-MiniLM-L6-v2`). **Do not modify the encoder module.**

Stub signature and docstring (full code is the implementer's task):

```python
"""CosineLabelMatcher — embedding-cosine label equivalence with alias
override and graceful encoder-failure degradation."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

import numpy as np

from pipeline_service.models.label_encoder import LabelEncoder
from pipeline_service.eval.gt_eval.matchers.protocol import LabelMatcher

logger = logging.getLogger(__name__)

# Path is resolved relative to the gt_eval/datasets/ directory. The
# aliases file is OWNED by section-02; a missing file is treated as an
# empty alias map (no override).
_DEFAULT_ALIASES_PATH = (
    Path(__file__).parent.parent / "datasets" / "lvis_aliases.json"
)


class CosineLabelMatcher:
    """Default LabelMatcher: identical-string short-circuit, then alias
    map lookup, then sentence-transformers cosine.

    Threshold defaults to 0.6 (calibrated against the 60 sentinel pairs
    in test_label_matcher.py). Override via constructor or
    EVAL_LABEL_MATCH_THETA env var (orchestrator's responsibility — this
    class accepts only the constructor argument).

    Encoder failure (any exception from .encode) returns True. Rationale:
    the production label_text_compat path makes the same choice. A sick
    encoder must NOT silently downgrade detection-quality metrics by
    blocking matches.
    """

    def __init__(
        self,
        encoder: Optional[LabelEncoder] = None,
        threshold: float = 0.6,
        aliases_path: Optional[Path] = None,
    ) -> None:
        self._encoder = encoder or LabelEncoder()
        self._threshold = threshold
        self._aliases = self._load_aliases(aliases_path or _DEFAULT_ALIASES_PATH)

    @staticmethod
    def _load_aliases(path: Path) -> dict[str, set[str]]:
        """Load lvis_aliases.json. Missing file -> empty map. Malformed
        JSON -> log warning, return empty map (do not crash the eval
        run)."""
        ...

    @staticmethod
    def _normalise(text: str) -> str:
        """lowercase, strip, replace underscores with spaces, collapse
        whitespace. Used for the identical-string short-circuit."""
        ...

    def __call__(self, predicted: str, gt_category: str) -> bool:
        # 1. identical-string short-circuit (post-normalise)
        # 2. alias-map override (predicted -> {set of gt_categories})
        # 3. encoder cosine; encoder failure -> return True (degraded)
        ...
```

**Alias-file shape** (declared by §02, read here): JSON object mapping `predicted -> [list of gt_category names]`. Loader converts the list to a `set` for O(1) lookup.

**Normalisation rule** (used both for short-circuit and for encoder input): lowercase + strip + underscores-to-spaces + whitespace-collapse. Punctuation-stripping is **not** required (existing convention).

### `gt_eval/matchers/iou.py`

IoU + Hungarian assignment with coordinate hygiene.

```python
"""IoU computation and Hungarian-assignment box matching."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Iterable, Sequence

import numpy as np

logger = logging.getLogger(__name__)

# Hungarian backend selection at module load. scipy>=1.13 is in pyproject.
# Fallback to a documented greedy implementation if the import fails
# (defensive against future packaging surprises; not expected in v1).
try:
    from scipy.optimize import linear_sum_assignment as _hungarian
    _HUNGARIAN_AVAILABLE = True
except ImportError:  # pragma: no cover -- defensive
    _HUNGARIAN_AVAILABLE = False
    logger.warning(
        "scipy.optimize.linear_sum_assignment unavailable; "
        "match_boxes will use greedy fallback."
    )


@dataclass(frozen=True)
class Match:
    """A single (pred, gt) pairing."""
    pred_idx: int
    gt_idx: int
    iou: float


def _xywh_to_xyxy_clamped(
    x: float, y: float, w: float, h: float,
    image_width: int, image_height: int,
) -> tuple[float, float, float, float]:
    """Convert pixel xywh to xyxy with exclusive max edges and clamp to
    [0, image_width] x [0, image_height]. Returns (x1, y1, x2, y2)."""
    ...


def _iou_xyxy(
    a: tuple[float, float, float, float],
    b: tuple[float, float, float, float],
) -> float:
    """IoU of two xyxy boxes. Max edges exclusive. Returns 0.0 for
    disjoint or touching boxes."""
    ...


def match_boxes(
    predictions: Sequence,        # PipelineDetection-shaped (has .bbox xywh)
    gts: Sequence,                # GtBox xyxy NamedTuple from datasets.protocol
    *,
    iou_threshold: float = 0.5,
    image_width: int,
    image_height: int,
) -> tuple[list[Match], list[int], list[int]]:
    """Match predictions to GT boxes by IoU using Hungarian assignment
    (scipy.optimize.linear_sum_assignment maximising IoU).

    Steps:
      1. Convert each prediction's xywh BBox to xyxy with image-bound
         clamping (a pred fully outside the image collapses to zero area).
      2. Drop zero-area predictions entirely (their indices appear in
         neither the matches list nor unmatched_pred_idxs — they are
         not part of the matchable set).
      3. Build the IoU matrix (n_clamped_preds x n_gts).
      4. Run Hungarian on -IoU (linear_sum_assignment minimises).
      5. Filter assignments where IoU < iou_threshold; these go into
         unmatched_pred_idxs / unmatched_gt_idxs.
      6. Return (matches, unmatched_pred_idxs, unmatched_gt_idxs)
         where pred_idxs are indices into the *original* predictions
         sequence (zero-area dropped preds never appear).

    Greedy fallback (when scipy unavailable): sort all (i, j) cells by
    descending IoU, take the first available pair where neither i nor j
    is already used and IoU >= iou_threshold. Documented as suboptimal
    for ambiguous cases.
    """
    ...
```

**Critical correctness contracts** (these are pinned by tests):

- **Max edges exclusive**: `iou((0,0,10,10), (10,0,20,10)) == 0.0` (touching, not overlapping).
- **Clamping before IoU**: predictions with negative origin or overflow are clamped to image bounds *before* the IoU matrix is built.
- **Zero-area filter**: predictions that collapse to zero area after clamping (or were zero-area originally) are dropped entirely. Their indices do NOT appear in the result. This means downstream consumers must not assume `len(matches) + len(unmatched_pred_idxs) == len(predictions)`.
- **Hungarian, not greedy**: the 3×3 ambiguous test pins the optimal assignment. Use `scipy.optimize.linear_sum_assignment(-iou_matrix)` (negate to convert min-cost to max-IoU).
- **Threshold filter is post-assignment**: Hungarian assigns optimally first, then matches with IoU below threshold are demoted to unmatched. Don't pre-filter the IoU matrix to threshold (that biases the assignment).

### `gt_eval/matchers/__init__.py`

Re-export the public surface so callers can `from pipeline_service.eval.gt_eval.matchers import LabelMatcher, CosineLabelMatcher, Match, match_boxes`:

```python
from .protocol import LabelMatcher
from .label_cosine import CosineLabelMatcher
from .iou import Match, match_boxes

__all__ = ["LabelMatcher", "CosineLabelMatcher", "Match", "match_boxes"]
```

## Coordinate Conventions Reference

- **`PipelineDetection.bbox`** is `BBox` xywh in pixels, top-left origin (existing `pipeline_service.types`). **Do not change** that type.
- **`GtBox`** (from §02 `datasets.protocol`) is xyxy with exclusive max edges. Top-left origin.
- **All IoU math is xyxy** internally to `iou.py`. The xywh→xyxy conversion is performed once at the top of `match_boxes`.
- **Image bounds** must be passed explicitly (`image_width`, `image_height`). The matcher does not infer them.

## Implementation Checklist

1. Create `gt_eval/matchers/protocol.py` with the `LabelMatcher` Protocol (runtime-checkable). Run `test_label_matcher.py::TestLabelMatcherProtocol`.
2. Create `gt_eval/matchers/iou.py` with `Match`, `_xywh_to_xyxy_clamped`, `_iou_xyxy`, and `match_boxes`. Run `test_iou_matcher.py` end-to-end (all classes).
3. Create `gt_eval/matchers/label_cosine.py` with `CosineLabelMatcher`. Wire the shared `mock_label_encoder` conftest fixture. Run `test_label_matcher.py::TestCosineLabelMatcher`.
4. Populate `gt_eval/matchers/__init__.py` with re-exports.
5. Verify the full module test command from `index.md` passes locally:
   `uv run --project pipeline-service pytest tests/unit/eval/test_label_matcher.py tests/unit/eval/test_iou_matcher.py -q`
6. Confirm no edits leaked into `pipeline_service.models.label_encoder` or `pipeline_service.types`.

## Out of Scope (Owned by Other Sections)

- **`lvis_aliases.json` content / authoring** — §02 owns the data file. This section reads it defensively (missing-file fallback).
- **`LabelMatcher` consumers** — class-aware mAP, label F1, and hallucination metrics consume the matcher; they live in §05.
- **Preflight / orchestration** — building `CosineLabelMatcher` instances and threading them through is §08's job.
- **`EVAL_LABEL_MATCH_THETA` env var** — read by §08's orchestrator and passed to `CosineLabelMatcher(threshold=...)`. The matcher class itself only accepts a constructor argument.