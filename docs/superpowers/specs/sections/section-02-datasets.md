Now I have enough context to write the section content. Let me output the markdown for section-02-datasets.

# section-02-datasets — LVIS-OV Dataset Loader + EvalDataset Protocol

## Goal

Implement the `EvalDataset` Protocol (a generic interface for ground-truth datasets) and the LVIS-OV concrete loader that downloads, caches, filters, and deterministically samples a 500-image rare-class subset filtered to indoor / household supercategories. The loader is the data source that feeds every per-image evaluation in the GT-eval harness.

## Dependencies

- **section-01-foundation** must be complete:
  - `pipeline-service/pyproject.toml` carries `requests>=2.32`, `tqdm>=4.67`, `numpy` (already present).
  - The empty package skeleton exists at `pipeline-service/pipeline_service/eval/gt_eval/datasets/__init__.py`.
  - `pipeline-service/eval/datasets/` is gitignored.
  - `pipeline-service/tests/replay/fixtures/eval/` contains the 5 small JPEGs, `gt.json`, `synthetic_image_ids.json`, and a synthetic LVIS-shaped zip archive.
  - `pipeline-service/tests/unit/eval/conftest.py` exists with shared fixtures.

This section does **not** depend on §03 (matchers) or §04 (judges); it can be implemented in parallel with them.

## Files to Create

All paths absolute under the repo root.

### Production code

1. `/Users/mrarindampaul/Develop/allmythings/pipeline-service/pipeline_service/eval/gt_eval/datasets/__init__.py` — re-exports `EvalDataset`, `GtBox`, `LvisDataset`, `LvisConfig`.
2. `/Users/mrarindampaul/Develop/allmythings/pipeline-service/pipeline_service/eval/gt_eval/datasets/protocol.py` — `GtBox` NamedTuple + `EvalDataset` runtime-checkable Protocol.
3. `/Users/mrarindampaul/Develop/allmythings/pipeline-service/pipeline_service/eval/gt_eval/datasets/lvis.py` — `LvisDataset` concrete impl, `LvisConfig` frozen dataclass, downloader with sha256 verification, `LVIS_LOCAL_ZIP` escape hatch, `numpy.random.default_rng`-based deterministic sampling, JSON-parse pickle cache, `LICENSE-LVIS.md` write on first download, `version_sha256` property.
4. `/Users/mrarindampaul/Develop/allmythings/pipeline-service/pipeline_service/eval/gt_eval/datasets/lvis_supercats.json` — DATA file (allow-list).
5. `/Users/mrarindampaul/Develop/allmythings/pipeline-service/pipeline_service/eval/gt_eval/datasets/lvis_aliases.json` — DATA file (empty `{}` by default).

### Tests (write FIRST — TDD)

6. `/Users/mrarindampaul/Develop/allmythings/pipeline-service/tests/unit/eval/test_protocol.py`
7. `/Users/mrarindampaul/Develop/allmythings/pipeline-service/tests/unit/eval/test_lvis_loader.py`

---

## Background and Context

### Where this fits in the harness

The `gt_eval/` package adds a ground-truth-based evaluation path alongside the existing agreement-only metrics. The orchestrator (§08) iterates an `EvalDataset` and, per yielded `(image_path, list[GtBox])` pair, invokes the pipeline runner (§07), passes its predictions through the matchers (§03), and aggregates with the metrics modules (§05). The dataset loader is therefore the **first** piece of data flow.

Datasets are **plug-replaceable** via the `EvalDataset` Protocol. v1 ships only `LvisDataset`; v2 will add `OpenImagesDataset`, etc. Selection happens in the orchestrator via env (`EVAL_DATASET=lvis`, default).

### LVIS-OV in one paragraph

LVIS is a long-tail object-detection dataset that re-annotates COCO 2017 train images with a rare-class taxonomy. "Rare-class" means categories appearing in fewer than 10 train images each — which is exactly the long-tail regime our pipeline must perform on. We filter further to indoor / household supercategories (`furniture`, `appliance`, `home decor`, `kitchen`, `bathroom_furniture`, `lighting`, `textile`) so the eval reflects the app's actual usage. Annotations live at `https://dl.fbaipublicfiles.com/LVIS/lvis_v1_train.json.zip`; per-image JPEGs live at `https://images.cocodataset.org/train2017/{image_file_name}` (only sampled images are downloaded).

### `BBox` convention

LVIS native bbox format is xywh-pixels. The `GtBox` NamedTuple stores **xyxy-pixel** floats (top-left origin, max edges exclusive) so it composes directly with the IoU matcher (§03) without a coordinate-system translation step. The conversion is internal to the loader.

### Why pickle-cache the parsed annotations

The LVIS train JSON is ~600 MB; `json.load` takes 30–60 s on the dev Mac. The loader pickles the parsed dict on first parse and `pickle.load`s it on subsequent runs. The pickle file lives under `cache_root/lvis_annotations.pkl`.

### Why `numpy.random.default_rng(seed).choice` instead of `random.sample`

`random.sample` algorithm is not pinned across Python versions; `numpy.random.default_rng(seed).choice(image_ids, size=N, replace=False)` is pinned to the numpy version (already a dep) and is stable across Python versions, so a `seed=0` baseline run remains reproducible after a Python upgrade.

---

## Tests (write FIRST)

### `tests/unit/eval/test_protocol.py`

Pin the Protocol surface — small file, three tests.

```python
"""Protocol-level tests for EvalDataset and GtBox."""
# - test GtBox is a NamedTuple with fields: x1, y1, x2, y2,
#   category_id, category_name (and types as documented).
# - test a class implementing the EvalDataset Protocol passes
#   isinstance(x, EvalDataset) thanks to @runtime_checkable.
# - test a class missing one of name / category_names /
#   version_sha256 / attribution_text / __iter__ fails
#   isinstance(x, EvalDataset).
```

### `tests/unit/eval/test_lvis_loader.py`

Pin the loader behaviour. Tests use the synthetic LVIS-shaped zip archive at `tests/replay/fixtures/eval/synthetic_lvis_archive.zip` (50 fake images + tiny LVIS-shaped annotations JSON) created in §01.

Required tests (stub-level — implementer fills bodies, no full code is needed):

- **LVIS_LOCAL_ZIP short-circuit**: with `LVIS_LOCAL_ZIP` env var pointing at the fixture archive, no HTTP calls happen. Mock `requests.get` and assert it was not called.
- **Deterministic sampling — same seed**: `LvisDataset(LvisConfig(seed=0, sample_size=10))` iterated twice yields the same image-id set (and same order).
- **Deterministic sampling — different seed**: `seed=0` and `seed=1` yield different image-id sets; intersection is small but allowed to be non-empty.
- **Sampler identity**: monkey-patch `numpy.random.default_rng` with a spy and assert it is called with the configured seed and that `.choice(...)` is the actual sampling call.
- **Supercategory filter**: an image whose only GT boxes are in a supercategory NOT in `lvis_supercats.json` does not appear in the iteration; an image with at least one allowed-supercategory GT box does. (Use the synthetic archive's known taxonomy.)
- **Cache hit on second iter**: instantiate two `LvisDataset` objects pointing at the same `cache_root`, mock the HTTP layer; HTTP is hit on the first iter and NOT hit on the second.
- **Pickle cache for parsed JSON**: monkey-patch `json.load` with a spy. First instantiation calls it once; second instantiation pointed at the same `cache_root` does NOT call it (loaded via `pickle.load`).
- **sha256 verification**: when `LvisConfig.expected_archive_sha256` is set and the archive's actual sha256 doesn't match, the constructor raises a clearly-named exception (e.g. `LvisArchiveSha256Mismatch`) before parsing.
- **LICENSE-LVIS.md write on first download**: after first `__iter__`, `cache_root / "LICENSE-LVIS.md"` exists and contains the LVIS CC-BY 4.0 + COCO CC-BY 4.0 attribution text.
- **`version_sha256` property**: returns the sha256 of the LVIS archive after first download (matches what was verified, when `expected_archive_sha256` was set).

Use the existing `pipeline-service` test conventions: `pytest-mock` for HTTP mocking, `tmp_path` for `cache_root`, `monkeypatch.setenv` for `LVIS_LOCAL_ZIP`. `asyncio_mode=auto` is configured globally; this module is sync.

---

## Implementation Details

### `protocol.py`

```python
"""EvalDataset Protocol + GtBox NamedTuple."""
from pathlib import Path
from typing import Iterable, NamedTuple, Protocol, runtime_checkable


class GtBox(NamedTuple):
    """One GT box. xyxy pixels, top-left origin, max edges exclusive."""
    x1: float
    y1: float
    x2: float
    y2: float
    category_id: int
    category_name: str


@runtime_checkable
class EvalDataset(Protocol):
    """A pluggable GT dataset. v2 will add OpenImagesDataset etc."""

    name: str
    category_names: list[str]
    version_sha256: str
    attribution_text: str

    def __iter__(self) -> Iterable[tuple[Path, list[GtBox]]]: ...
```

Notes:
- `@runtime_checkable` is required so `isinstance(x, EvalDataset)` works in tests.
- `attribution_text` is consumed by §10 rollout step 6 (README) and by the `LICENSE-*.md` write logic in `lvis.py`.

### `lvis.py`

Frozen `LvisConfig` dataclass with these fields (all defaults match §5.1 env-var defaults):

| Field | Default | Notes |
| --- | --- | --- |
| `cache_root: Path` | `pipeline-service/eval/datasets/lvis-ov/` | Resolved relative to the pipeline-service package root. |
| `sample_size: int` | `500` | Overridable via env `EVAL_SAMPLE_SIZE` (parsed by orchestrator, passed in). |
| `rare_class_only: bool` | `True` | Filter LVIS categories where `frequency=="r"`. |
| `indoor_supercats_only: bool` | `True` | Filter via `lvis_supercats.json`. |
| `download_url: str` | `"https://dl.fbaipublicfiles.com/LVIS/lvis_v1_train.json.zip"` | Annotations archive. |
| `images_base_url: str` | `"https://images.cocodataset.org/train2017/"` | Per-image base. |
| `expected_archive_sha256: str \| None` | `None` | When set, verified after download. |
| `seed: int` | `0` | Fed to `numpy.random.default_rng`. |
| `supercats_file: Path` | `gt_eval/datasets/lvis_supercats.json` | Allow-list (DATA, editable). |
| `aliases_file: Path` | `gt_eval/datasets/lvis_aliases.json` | Used by §03's matcher; this section just ships the file. |

`class LvisDataset` public surface:

```python
class LvisDataset:
    """LVIS-OV concrete EvalDataset: download, cache, filter, sample."""

    name: str = "lvis-ov"
    attribution_text: str = (
        "LVIS dataset (CC-BY 4.0). Images from COCO 2017 (CC-BY 4.0). "
        "https://www.lvisdataset.org · https://cocodataset.org"
    )

    def __init__(self, config: LvisConfig) -> None: ...

    @property
    def category_names(self) -> list[str]: ...

    @property
    def version_sha256(self) -> str: ...
    """sha256 of the LVIS annotations archive (used by §06 stamping)."""

    def __iter__(self) -> Iterable[tuple[Path, list[GtBox]]]: ...
```

Construction-time work:
1. Resolve `cache_root`, create if missing.
2. Decide source: if `LVIS_LOCAL_ZIP` env var is set and points at an existing file, use it; else download `download_url` to `cache_root / "lvis_v1_train.json.zip"` (skip download if file already exists). Use `requests` with stream=True and `tqdm` for the progress bar (existing-pattern, no new deps).
3. Compute the actual archive sha256. If `config.expected_archive_sha256` is set and differs, raise `LvisArchiveSha256Mismatch`. Stash the actual sha256 in `self._version_sha256`.
4. Write `cache_root / "LICENSE-LVIS.md"` with the attribution text on first download (idempotent — skip if file exists).
5. Load annotations:
   - If `cache_root / "lvis_annotations.pkl"` exists and is newer than the zip, `pickle.load` it.
   - Else: extract the JSON from the zip in-memory, `json.load` it, then `pickle.dump` to the cache file.
6. Build the supercategory allow-list from `lvis_supercats.json`. Build the per-image GT-boxes index, filtering to:
   - rare-class categories (`frequency == "r"`) when `rare_class_only`.
   - allowed-supercat categories when `indoor_supercats_only`.
7. Compute the candidate image-id list (images that have ≥1 surviving GT box).
8. Apply `numpy.random.default_rng(config.seed).choice(image_ids, size=min(sample_size, len(image_ids)), replace=False)` — store the resulting list of image ids.
9. `category_names` is the deduped list of LVIS category names that survive filtering.

Per-iteration work in `__iter__`:
1. For each sampled image-id (in the deterministic order from step 8):
   - Compute `image_path = cache_root / "images" / lvis_image_filename`.
   - If the file does not exist, download it from `images_base_url + lvis_image_filename` (skip if `LVIS_LOCAL_ZIP` mode and the file is already in the cache from the synthetic archive).
   - Convert the image's surviving GT annotations from xywh-pixels to `GtBox` xyxy-pixels (max edges exclusive — `x2 = x + w`, `y2 = y + h`).
   - Yield `(image_path, list[GtBox])`.

Failure-mode contracts (covered fully by §08's `test_failure_modes.py`, but the loader must:
- Raise `LvisDownloadError` (or surface the underlying `requests` exception with a clearly-named wrapper) when the network is unreachable. The error message must mention `LVIS_LOCAL_ZIP` so the operator knows the escape hatch.
- Raise `LvisArchiveSha256Mismatch` (per the test in this section) when verification fails. The error message must mention `EVAL_LVIS_VERSION_BUMP`.

### `lvis_supercats.json`

```json
{
  "allowed": [
    "furniture",
    "appliance",
    "home decor",
    "kitchen",
    "bathroom_furniture",
    "lighting",
    "textile"
  ]
}
```

This is the LVIS supercategory allow-list used by `LvisDataset` to filter image candidates. It is editable as data — additions don't require code changes.

### `lvis_aliases.json`

```json
{}
```

Empty by default. v1 populates this only as systematic open-vocab → LVIS-name mismatches surface during calibration (e.g. `{"tv stand": "entertainment_center"}`). The matcher in §03 reads this file; this section ships only the empty stub.

### `__init__.py`

```python
"""gt_eval.datasets — pluggable EvalDataset Protocol + concrete LVIS impl."""
from .protocol import EvalDataset, GtBox
from .lvis import LvisConfig, LvisDataset

__all__ = ["EvalDataset", "GtBox", "LvisConfig", "LvisDataset"]
```

---

## Logging (per global rule §11)

Add structured logging at these decision points (use `logging.getLogger(__name__)` — match existing pipeline-service conventions, no new logging library):

- **INFO** on first download start (URL, target path, expected size if known).
- **INFO** on download success (final path, archive sha256).
- **INFO** on `LVIS_LOCAL_ZIP` short-circuit (pointing at the local path).
- **INFO** on cache hit (annotations zip already present, pickle cache hit).
- **INFO** after sampling: `n_candidate_images, n_sampled_images, seed`.
- **WARN** when `expected_archive_sha256` is unset (operator should set it for reproducibility).
- **ERROR** on sha256 mismatch (with both expected and actual values).
- **ERROR** on download failure (with the operator-actionable hint about `LVIS_LOCAL_ZIP`).
- **DEBUG** per-image: image-id, file existence, GT box count after filter.

---

## Definition of Done

- [ ] `tests/unit/eval/test_protocol.py` exists and passes (3 tests).
- [ ] `tests/unit/eval/test_lvis_loader.py` exists and passes (10 tests as listed above).
- [ ] `protocol.py`, `lvis.py`, `lvis_supercats.json`, `lvis_aliases.json`, `__init__.py` exist at the listed paths.
- [ ] `from pipeline_service.eval.gt_eval.datasets import EvalDataset, GtBox, LvisConfig, LvisDataset` works.
- [ ] `isinstance(LvisDataset(LvisConfig(...)), EvalDataset)` returns True.
- [ ] No modifications to existing `pipeline_service/eval/run_eval.py`, `pipeline_service/eval/corpus_walker.py`, or any production module outside `gt_eval/datasets/`.
- [ ] No new dependencies added beyond those already declared in §01 (`requests`, `tqdm`, `numpy`).
- [ ] `uv run --project pipeline-service pytest tests/unit/eval/test_protocol.py tests/unit/eval/test_lvis_loader.py -q` passes locally.
- [ ] `uv run --project pipeline-service pytest tests/unit/eval tests/integration -q` (the section's project test command) does not regress beyond what §01 produced.