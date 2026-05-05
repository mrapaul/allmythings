The pipeline-service directory doesn't exist yet — this section creates the foundation. Now I have all the context needed. Let me generate the section content.

# section-01-foundation — Dependencies, Package Skeleton, and Test Fixtures

## Purpose

This section lays the foundation for the new GT-based evaluation harness. It is the **only** section in Batch 1 — every other section depends on it. After this section lands:

- All required Python dependencies (`pycocotools`, `torchmetrics`, `scipy`, `requests`, `tqdm`, optional `pycocotools-binary`) are installed and verified.
- The empty package skeleton at `pipeline-service/pipeline_service/eval/gt_eval/` exists with the directory structure documented in §3.1 of the plan.
- The shared replay fixture corpus under `pipeline-service/tests/replay/fixtures/eval/` exists (5 small JPEGs, `gt.json`, `synthetic_image_ids.json`, and the small synthetic LVIS-shaped zip used by the LVIS loader unit tests).
- A shared `tests/unit/eval/conftest.py` exists with the cross-section fixtures (mock `OllamaClient`, mock `LabelEncoder`, etc.) that sections 02–08 consume.
- `pipeline-service/eval/datasets/` is gitignored.

This section does **not** modify any existing pipeline code, write any non-trivial logic, or touch the existing agreement-based eval rig. It is purely infrastructure.

## Background and Context

The `pipeline-service` Python package currently has an evaluation rig at `pipeline-service/pipeline_service/eval/` that measures only **inter-detector agreement** — it cannot tell whether predictions are actually correct. The new GT-based path, called `gt_eval`, is being added under that same `eval/` namespace.

The full architectural intent (for context only — not implemented in this section):

```
pipeline-service/
├ pipeline_service/
│   └ eval/
│       ├ __init__.py                  (existing, untouched in §01)
│       ├ run_eval.py                  (existing, untouched in §01)
│       ├ corpus_walker.py             (existing, untouched)
│       ├ metrics.py                   (existing, untouched)
│       └ gt_eval/                     (NEW — created empty in §01)
│           ├ __init__.py
│           ├ run.py                   (§08)
│           ├ runner.py                (§07)
│           ├ datasets/
│           │   ├ __init__.py
│           │   ├ protocol.py          (§02)
│           │   ├ lvis.py              (§02)
│           │   ├ lvis_supercats.json  (§02)
│           │   └ lvis_aliases.json    (§02)
│           ├ matchers/
│           │   ├ __init__.py
│           │   ├ protocol.py          (§03)
│           │   ├ label_cosine.py      (§03)
│           │   └ iou.py               (§03)
│           ├ metrics/
│           │   ├ __init__.py
│           │   ├ coco.py              (§05)
│           │   ├ labels.py            (§05)
│           │   └ hallucination.py     (§05)
│           ├ judges/
│           │   ├ __init__.py
│           │   ├ protocol.py          (§04)
│           │   └ qwen_local.py        (§04)
│           └ baseline.py              (§06)
├ eval/
│   ├ datasets/                        (NEW — gitignored in §01)
│   ├ thresholds.json                  (existing — extended in §08)
│   ├ baseline.json                    (existing — extended in §06)
│   └ last-metrics.json                (existing — extended in §08)
└ tests/
    ├ unit/eval/                        (NEW — conftest + per-section files)
    │   └ conftest.py                  (§01 — shared fixtures)
    ├ integration/                      (NEW test files in §08)
    └ replay/fixtures/eval/            (NEW — fixture corpus from §01)
```

This section creates **only the empty package directories with `__init__.py` files, the test fixture corpus, the shared `conftest.py`, the dependency additions, and the gitignore line**. Concrete implementation modules (`protocol.py`, `lvis.py`, etc.) are populated by their respective owning sections (§02–§08).

## Dependencies

None. This is the root section in Batch 1.

## Tests First (TDD)

This section's tests are the import / dependency smoke tests from `claude-plan-tdd.md` §8. The full file lives at:

`pipeline-service/tests/unit/eval/test_dependencies.py`

Tests to write (stub-level only — no assertions beyond the import succeeding):

- Test: `import pycocotools` succeeds (or — if the source build fails on Apple Silicon and the `pycocotools-binary` fallback is in use — the same import still resolves, since both packages publish the `pycocotools` namespace).
- Test: `import torchmetrics.detection` succeeds (used as the fallback mAP backend in §05).
- Test: `from scipy.optimize import linear_sum_assignment` succeeds (used by the Hungarian matcher in §03).
- Test: `from numpy.random import default_rng` succeeds (used by the deterministic LVIS sampler in §02).
- Test: `import requests` succeeds (used by the LVIS downloader in §02).
- Test: `import tqdm` succeeds (progress bar for downloads + per-image eval).

These tests are **not** intended to be exhaustive — they exist solely to fail loudly if a later section's runtime import would crash on a fresh checkout. They are the canary that the foundation is healthy.

Stub form — exact contents are minimal, e.g.:

```python
# tests/unit/eval/test_dependencies.py
"""Smoke tests for the dependencies added in section-01-foundation.

These tests fail loudly if a later section's runtime import would crash
on a fresh checkout. They do not assert any behaviour beyond
"the import resolves".
"""

def test_pycocotools_imports() -> None:
    """pycocotools (or pycocotools-binary fallback) is importable."""
    import pycocotools  # noqa: F401

# ... one tiny test per dependency from the list above
```

No fixtures, no parametrisation, no mocks. Each test is two lines plus a docstring.

## Implementation Details

### 1. Add dependencies to `pipeline-service/pyproject.toml`

Append the following to the `[project] dependencies` (or `[tool.uv]` / `[tool.poetry.dependencies]` section, depending on the existing style — match the file). Floors are taken from §8 of the plan:

| Package | Floor | Purpose |
| --- | --- | --- |
| `pycocotools` | `>=2.0.7` | COCO mAP eval (with torchmetrics fallback). |
| `torchmetrics` | `>=1.4` | Fallback mAP backend. |
| `scipy` | `>=1.13` | `linear_sum_assignment` for Hungarian matching. |
| `requests` | `>=2.32` | LVIS downloader (sync). |
| `tqdm` | `>=4.67` | Progress bar for downloads + per-image eval. |

`pycocotools-binary` is added as an **optional** extra (Apple-Silicon-friendly wheel fallback if `pycocotools` source-build fails). Define it under an extras block named `eval-binary` (or whatever the existing `pyproject.toml` extras-naming convention dictates) so it can be selected with `uv sync --extra eval-binary` on Macs where the source build of `pycocotools` doesn't work.

`numpy` and `sentence-transformers` are already direct dependencies of `pipeline-service` — do not re-declare them. No new test-only dependencies are needed; `pytest`, `pytest-asyncio`, and `pytest-mock` are already in the dev dependency set.

**Verification step** (per §10 of the plan): in a clean venv on the dev Mac, run `cd pipeline-service && uv sync` (or `uv add` of the new packages) and confirm that all dependencies install cleanly. Watch for `pycocotools` build failures on Apple Silicon. If the source build fails, switch the dev environment to `uv sync --extra eval-binary` and verify that the binary wheel resolves the issue. The `tests/unit/eval/test_dependencies.py` smoke suite is the automated continuation of this verification.

### 2. Create the empty package skeleton

Create the following directories and empty `__init__.py` files. The `__init__.py` files MUST be empty in §01 — sections 02–08 will populate the corresponding sibling modules and may extend `__init__.py` to re-export public names at that point.

- `pipeline-service/pipeline_service/eval/gt_eval/__init__.py`
- `pipeline-service/pipeline_service/eval/gt_eval/datasets/__init__.py`
- `pipeline-service/pipeline_service/eval/gt_eval/matchers/__init__.py`
- `pipeline-service/pipeline_service/eval/gt_eval/metrics/__init__.py`
- `pipeline-service/pipeline_service/eval/gt_eval/judges/__init__.py`

Do NOT create any other `.py` files in this section — `protocol.py`, `lvis.py`, `iou.py`, etc. are all created by their respective owning sections. Creating empty stubs here would be a violation of the "stub definitions only when absolutely necessary" rule and would make the per-section TDD red phase indistinguishable from "the file already exists empty".

### 3. Add the gitignore line

Append a single new line to `pipeline-service/.gitignore`:

```
eval/datasets/
```

This excludes the LVIS-OV download cache (`pipeline-service/eval/datasets/lvis-ov/` and any future sibling dataset caches) from version control. The line `pipeline-service/eval/last-metrics.json` is — per the plan §10 step 5 — already gitignored; verify before adding and add only what's missing. Do not modify any unrelated `.gitignore` lines.

### 4. Create the test fixture corpus

Create the directory `pipeline-service/tests/replay/fixtures/eval/` with the following contents. The corpus is **shared across multiple sections** (§02 consumes the LVIS archive; §06 / §08 consume the gt.json + JPEGs); creating it once here avoids duplication and ensures all sections see identical inputs.

#### 4a. `pipeline-service/tests/replay/fixtures/eval/images/`

Five small JPEG files. Each MUST be:

- Real, decodable JPEG (not a placeholder text file).
- Small (≤ ~100 KB each — these are committed to git).
- Distinct enough that hash-based fixture matching in §08 can tell them apart.
- Contain content roughly consistent with indoor / household scenes, since they are used as stand-ins for LVIS-OV indoor images. Stock photographs of a couch, table, fridge, lamp, and bookshelf are appropriate. Generated solid-colour images are acceptable if no suitable real photographs are available — what matters for the unit tests is shape and decodability, not photographic realism. (The opt-in real-pipeline integration test in §08 is the only place actual visual content matters, and that test is gated on `EVAL_TEST_REAL_PIPELINE=1`.)

Suggested filenames (any 5 distinct JPEG names work — the test files address them by `Path` not by hardcoded name): `couch.jpg`, `dining_table.jpg`, `fridge.jpg`, `lamp.jpg`, `bookshelf.jpg`.

#### 4b. `pipeline-service/tests/replay/fixtures/eval/gt.json`

A minimal LVIS-shaped GT JSON containing:

- 5 image entries (one per JPEG above), each with `id`, `file_name`, `width`, `height`.
- 12 GT box entries spread across the 5 images (uneven distribution — at least one image with 1 box, at least one with 3+ boxes, to exercise the per-image aggregation path).
- 4 distinct categories drawn from the LVIS taxonomy (e.g. `couch`, `dining_table`, `refrigerator`, `lamp`). Each category entry needs `id`, `name`, and `supercategory`.
- Bounding boxes in LVIS-native xywh-pixel format with the top-left origin convention. Coordinates must lie within each image's `width`/`height`.

Schema sketch (LVIS-shape — for context only, not full content):

```jsonc
{
  "images": [
    {"id": 1, "file_name": "couch.jpg", "width": 640, "height": 480},
    /* ... 4 more ... */
  ],
  "annotations": [
    {"id": 1, "image_id": 1, "category_id": 1,
     "bbox": [50, 100, 300, 200], "area": 60000},
    /* ... 11 more ... */
  ],
  "categories": [
    {"id": 1, "name": "couch", "supercategory": "furniture"},
    /* ... 3 more ... */
  ]
}
```

The exact coordinate values are not load-bearing in §01 — but they MUST be self-consistent (bbox within image bounds; `area` matches `w*h`; `image_id` and `category_id` resolve). The §02 LVIS loader, the §05 metrics tests, and the §08 integration test all consume this file; an internally inconsistent `gt.json` will manifest as cryptic failures in those sections.

#### 4c. `pipeline-service/tests/replay/fixtures/eval/synthetic_image_ids.json`

A flat JSON array of 1000 fake LVIS-style integer image IDs (e.g. `[100001, 100002, ..., 101000]`). Used by the §02 deterministic-sampling unit test to verify that `numpy.random.default_rng(seed).choice(image_ids, size=N, replace=False)` is the actual sampling path and that two identical seeds produce identical output. The values must be stable across reruns — generate them once (e.g. `list(range(100001, 101001))`) and commit the resulting JSON.

#### 4d. `pipeline-service/tests/replay/fixtures/eval/synthetic_lvis_archive.zip`

A small synthetic LVIS-shaped archive used by the §02 LVIS loader unit tests when `LVIS_LOCAL_ZIP` points at it. Contents:

- 50 tiny synthetic JPEGs (any small decodable JPEGs — they need not match the 5 in `images/`; can be 1×1 solid-colour images).
- One JSON file at the archive root with the same LVIS shape as `gt.json` above, but referencing all 50 synthetic images and ~100 GT boxes spanning all 7 supercategories listed in `lvis_supercats.json` (which is created in §02 — for now, use the supercategories named in §4.2 of the plan: `furniture`, `appliance`, `home decor`, `kitchen`, `bathroom_furniture`, `lighting`, `textile`).

The archive structure must match what `LvisDataset.__iter__` will look for in §02 — i.e. a flat zip with the JSON at `lvis_v1_train.json` (or the path the LVIS download would produce; §02 will pin the exact name). For §01, what matters is that the archive exists, decodes cleanly, and contains structurally valid LVIS-shaped JSON; §02's tests will exercise the actual loader logic against it.

**A note on archive size**: the plan calls this "synthetic" deliberately — 50 1×1-pixel JPEGs plus a small JSON should produce an archive well under 100 KB total, which is fine to commit. Do NOT include real LVIS data; that would be a license violation (CC-BY-4.0 attribution would be required) and would bloat the repo.

### 5. Create the shared `tests/unit/eval/conftest.py`

Path: `pipeline-service/tests/unit/eval/conftest.py`

This file holds the cross-section fixtures that sections 02–08 import. Including them here once avoids duplication and locks the mock interfaces so a section-by-section TDD effort doesn't drift.

Required fixtures (stub-level — implementations are minimal, just enough for the consumer tests in later sections to construct the mocks):

- `mock_ollama_client` — a `MagicMock` (or `unittest.mock.AsyncMock` for the async methods) mimicking the public surface of `pipeline_service.models.ollama_client.OllamaClient`. Used by §04's `QwenLocalJudge` tests. The mock should expose the methods that the real client exposes (`generate`, `health`, etc. — match the real signature without re-implementing behaviour); individual tests in §04 will configure return values per case.
- `mock_label_encoder` — a `MagicMock` mimicking `pipeline_service.models.label_encoder.LabelEncoder`. Used by §03's `CosineLabelMatcher` tests. Must expose at least `encode(text: str) -> np.ndarray` and the `_DEFAULT_MODEL_NAME` module-level constant via a configured attribute or patch helper.
- `eval_fixtures_dir` — a session-scoped fixture returning the `Path` to `tests/replay/fixtures/eval/` (the directory created in step 4 above). Lets every consumer locate the corpus without hardcoding a relative path.
- `tmp_eval_data_dir` — a function-scoped fixture returning a fresh `tmp_path / "eval"` for tests that write `baseline.json` / `last-metrics.json` / dataset cache (§02, §06, §08). Uses pytest's built-in `tmp_path`.

The conftest may also define lightweight helper fixtures (e.g. `make_pipeline_detection`, `make_scene_observation` factories) only if multiple sections will consume them. If a fixture is needed by exactly one section, it lives in that section's local conftest, not here.

Stub form:

```python
# tests/unit/eval/conftest.py
"""Shared fixtures for the gt_eval test suite.

These fixtures are consumed across multiple sections (§02–§08); keeping
them in one place locks the mock interfaces and avoids drift.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.fixture
def mock_ollama_client() -> AsyncMock:
    """Async mock of OllamaClient. §04 configures return values per test."""
    # ... minimal AsyncMock setup, signatures matching the real client ...


@pytest.fixture
def mock_label_encoder() -> MagicMock:
    """Mock of LabelEncoder. §03 configures encode() return values per test."""
    # ... minimal MagicMock setup ...


@pytest.fixture(scope="session")
def eval_fixtures_dir() -> Path:
    """Path to tests/replay/fixtures/eval/ — the shared corpus."""
    # ... resolve relative to __file__ and return ...


@pytest.fixture
def tmp_eval_data_dir(tmp_path: Path) -> Path:
    """Per-test scratch directory mimicking pipeline-service/eval/."""
    # ... create tmp_path / "eval" and return ...
```

Keep it minimal — every line that is not load-bearing for §02–§08 is a future maintenance liability.

### 6. Verify (manual smoke check before declaring §01 done)

Run from the repo root:

```
cd pipeline-service && uv sync
cd pipeline-service && uv run pytest tests/unit/eval/test_dependencies.py -q
```

Both must pass with zero warnings or failures. If `pycocotools` build fails, switch to `uv sync --extra eval-binary` and re-run. Document which path was needed in the PR description so the same machine class can be reproduced in CI.

Additionally, run:

```
cd pipeline-service && uv run python -c "import pipeline_service.eval.gt_eval"
cd pipeline-service && uv run python -c "import pipeline_service.eval.gt_eval.datasets"
cd pipeline-service && uv run python -c "import pipeline_service.eval.gt_eval.matchers"
cd pipeline-service && uv run python -c "import pipeline_service.eval.gt_eval.metrics"
cd pipeline-service && uv run python -c "import pipeline_service.eval.gt_eval.judges"
```

Each must succeed (the empty `__init__.py` files are valid Python packages). This catches typos in the directory names or accidentally-missing `__init__.py` files before any downstream section trips over them.

## Files Created in This Section

- `pipeline-service/pyproject.toml` — modified: 5 new dependencies + 1 optional extra.
- `pipeline-service/.gitignore` — modified: 1 new line `eval/datasets/`.
- `pipeline-service/pipeline_service/eval/gt_eval/__init__.py` — new, empty.
- `pipeline-service/pipeline_service/eval/gt_eval/datasets/__init__.py` — new, empty.
- `pipeline-service/pipeline_service/eval/gt_eval/matchers/__init__.py` — new, empty.
- `pipeline-service/pipeline_service/eval/gt_eval/metrics/__init__.py` — new, empty.
- `pipeline-service/pipeline_service/eval/gt_eval/judges/__init__.py` — new, empty.
- `pipeline-service/tests/unit/eval/__init__.py` — new, empty (package marker for the test directory).
- `pipeline-service/tests/unit/eval/conftest.py` — new, shared fixtures (per step 5).
- `pipeline-service/tests/unit/eval/test_dependencies.py` — new, dependency smoke tests (per "Tests First" above).
- `pipeline-service/tests/replay/fixtures/eval/images/{couch,dining_table,fridge,lamp,bookshelf}.jpg` — 5 new JPEG fixtures.
- `pipeline-service/tests/replay/fixtures/eval/gt.json` — new LVIS-shaped GT JSON for the 5-image corpus.
- `pipeline-service/tests/replay/fixtures/eval/synthetic_image_ids.json` — new fake-image-id list (1000 ints).
- `pipeline-service/tests/replay/fixtures/eval/synthetic_lvis_archive.zip` — new small synthetic LVIS-shaped archive.

## Out of Scope (do NOT do in this section)

- Do NOT create `protocol.py`, `lvis.py`, `iou.py`, `coco.py`, `qwen_local.py`, `baseline.py`, `runner.py`, `run.py`, `lvis_supercats.json`, or `lvis_aliases.json`. Those belong to §02–§08.
- Do NOT modify `pipeline_service/dagster_defs.py` or `sahi_recovery_op` — that env-gated edit lives in §07.
- Do NOT modify `pipeline_service/eval/run_eval.py` — the `EVAL_RUN_GT` / `EVAL_RUN_AGREEMENT` blocks are added in §08.
- Do NOT modify `pipeline-service/eval/thresholds.json` — schema extension is in §08.
- Do NOT touch `pipeline-service/eval/baseline.json` — that's §06.
- Do NOT add Makefile targets — `test-eval` and `test-eval-smoke` are in §08.
- Do NOT update `pipeline-service/README.md` — that's §08.
- Do NOT write or modify any tests under `tests/unit/eval/` other than `test_dependencies.py` and the `conftest.py` — section-specific test files are owned by their sections.

## Acceptance Criteria

1. `cd pipeline-service && uv sync` (with the appropriate extras flag if `pycocotools-binary` is needed) installs all new dependencies cleanly.
2. `cd pipeline-service && uv run pytest tests/unit/eval/test_dependencies.py -q` passes with all import smoke tests green.
3. The five `gt_eval/` subdirectories exist and are valid empty Python packages (each importable via `import pipeline_service.eval.gt_eval...`).
4. `pipeline-service/tests/replay/fixtures/eval/` contains the 5 JPEGs, `gt.json`, `synthetic_image_ids.json`, and `synthetic_lvis_archive.zip`. The JPEGs decode; `gt.json` parses as valid LVIS-shape JSON with internally consistent IDs and bboxes; the archive opens with `zipfile`.
5. `pipeline-service/tests/unit/eval/conftest.py` exists with the four required fixtures (`mock_ollama_client`, `mock_label_encoder`, `eval_fixtures_dir`, `tmp_eval_data_dir`) and is importable.
6. `pipeline-service/.gitignore` contains the line `eval/datasets/` (or `pipeline-service/eval/datasets/` if the gitignore is at repo root — match the existing convention in the file).
7. No existing tests in the `pipeline-service` suite have been broken. (Run `cd pipeline-service && uv run pytest -q` once after this section to confirm — though per the index, the per-section harness deliberately does not gate on the full suite; this is a one-off sanity check at section completion.)