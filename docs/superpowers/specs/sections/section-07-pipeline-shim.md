I have enough context. Now I'll generate the section content.

# Section 07 — Pipeline Shim and `EVAL_SKIP_SAHI` Wiring

## Purpose

This section packages the two pieces of work that touch the existing pipeline's invocation surface:

1. The **`single_image_pipeline_runner`** shim under `gt_eval/runner.py` — a top-level function that wraps a single LVIS image into a one-frame synthetic `CorpusItem`, drives `pipeline_job.execute_in_process`, and returns the resulting `SceneObservation`.
2. The **`EVAL_SKIP_SAHI`** env-gated short-circuit — a small, surgical edit to `pipeline_service/dagster_defs.py` (the `sahi_recovery_op` Dagster op) that turns the SAHI op into a no-op when the env var is truthy. This is the only non-additive change in the entire PR.

Both pieces are bundled together because they are the GT-eval orchestrator's only contact points with the live pipeline; testing them as a pair keeps regressions isolated.

## Dependencies

- **section-01-foundation** (must be complete): the empty `pipeline_service/eval/gt_eval/` package, the `tests/unit/eval/conftest.py` fixtures, and the dependency declarations in `pyproject.toml` must already be in place.
- This section is parallelizable with sections 02 (datasets), 03 (matchers), 04 (judges).
- Section 08 (orchestration) consumes the runner shim and the `EVAL_SKIP_SAHI` env gate via `apply_eval_skip_sahi`.

## Background context (necessary to implement in isolation)

### Why a shim is needed

The existing single-image pipeline entry is `corpus_walker.default_pipeline_runner`, which takes `(CorpusItem, list[dict])` — i.e., a multi-frame burst. LVIS-OV images are single-frame stills. The shim adapts the single-image GT-eval surface to the existing multi-frame Dagster surface without modifying `corpus_walker`.

### The `CorpusItem` and run-config shape

The runner constructs a synthetic `CorpusItem` and feeds the same Dagster run config used by the multi-frame burst path, with exactly one frame:

- `CorpusItem(scene_id=f"lvis-{image_path.stem}", capture_id="0", frame_paths=[image_path])`
- Run config:
  ```python
  {
      "ops": {
          "frame_intake": {
              "config": {
                  "frames": [
                      {
                          "frame_id": <stable id>,
                          "sha256":   <hex>,
                          "mime_type": "image/jpeg",
                          "photo_bytes_hex": <hex>,
                      }
                  ]
              }
          }
      }
  }
  ```
  The exact path inside `ops` should follow whatever the existing burst path uses — read `pipeline_service/dagster_defs.py` for the `pipeline_job` definition and the `frame_intake` op's config schema, and mirror it. Do not re-derive the schema; copy it.

### Why `EVAL_SKIP_SAHI` is env-gated rather than parameterised

`sahi_recovery_op` is a Dagster op invoked deep inside the job graph; reaching into it via op-level config requires every caller in the pipeline to thread the flag through. The env-var approach is one line at the top of the op body, the default behaviour is unchanged, and the GT-eval runner sets/unsets the env var around `execute_in_process` calls under its control.

### The `SceneObservation` return shape

The shim returns the `SceneObservation` produced by the `assemble_result` op (the terminal op of `pipeline_job`). On any internal op failure, the shim must surface the failure as a flagged `SceneObservation` (`flagged=True`, `errors` populated) rather than raising out — this is what the orchestrator expects so that one image's failure does not abort the whole 500-image run.

## Files to create / modify

### Create

1. `pipeline-service/pipeline_service/eval/gt_eval/runner.py` — the shim module.

### Modify

1. `pipeline-service/pipeline_service/dagster_defs.py` — add the `EVAL_SKIP_SAHI` env-gated short-circuit at the top of `sahi_recovery_op`.

### Tests to create

1. `pipeline-service/tests/unit/eval/test_runner.py`
2. `pipeline-service/tests/unit/eval/test_skip_sahi.py`

## Tests FIRST

Both test files live under `pipeline-service/tests/unit/eval/`. They consume the shared `conftest.py` fixtures laid down in section-01.

### `tests/unit/eval/test_runner.py`

Pins for `single_image_pipeline_runner`. Use `unittest.mock.patch` on `pipeline_service.eval.gt_eval.runner.pipeline_job.execute_in_process` so no real Dagster execution happens. Stubs / docstrings are fine — the test bodies must assert these contracts:

```python
"""Tests for single_image_pipeline_runner shim.

All tests mock pipeline_job.execute_in_process so no real Dagster
execution happens. Fixture image lives at
tests/replay/fixtures/eval/images/<one>.jpg (provided by section-01).
"""

def test_runner_is_a_top_level_function():
    """The shim must be importable as
    pipeline_service.eval.gt_eval.runner.single_image_pipeline_runner
    and be a plain function (not a closure) — required for unit-test
    patchability."""

def test_synthetic_corpus_item_shape(tmp_path, fixture_image):
    """Captures the CorpusItem built internally; asserts
    scene_id == f"lvis-{image_path.stem}", capture_id == "0",
    frame_paths == [image_path] (single-element list)."""

def test_run_config_has_one_frame_with_required_keys(monkeypatch, fixture_image):
    """Mock execute_in_process; capture the run_config kwarg.
    Assert the frames list has length 1 and each entry has the keys
    {'frame_id', 'sha256', 'mime_type', 'photo_bytes_hex'}.
    sha256 should match hashlib.sha256(image_bytes).hexdigest()."""

def test_apply_eval_skip_sahi_sets_env_then_unsets(monkeypatch, fixture_image):
    """When called with apply_eval_skip_sahi=True:
      - os.environ['EVAL_SKIP_SAHI'] is set to a truthy value
        (e.g. '1') BEFORE execute_in_process is called.
      - After execute_in_process returns, EVAL_SKIP_SAHI is
        removed from os.environ (or restored to its prior value
        if it was already set)."""

def test_apply_eval_top_k_sets_classification_top_k(monkeypatch, fixture_image):
    """apply_eval_top_k=3 → os.environ['CLASSIFICATION_TOP_K'] == '3'
    during the call, restored after."""

def test_returns_scene_observation_from_assemble_result(monkeypatch, fixture_image):
    """Mock execute_in_process so its return value's
    .output_for_node('assemble_result') yields a fake SceneObservation;
    assert that exact object is returned by the shim."""

def test_pipeline_op_failure_surfaces_as_flagged_not_raised(monkeypatch, fixture_image):
    """Force execute_in_process to raise (or to produce a result whose
    success flag is False). The shim must NOT re-raise. Instead it
    returns a SceneObservation with flagged=True and a non-empty
    .errors list naming the failed op (or 'pipeline' as a fallback)."""

def test_default_skip_sahi_false_does_not_touch_env(monkeypatch, fixture_image):
    """Default call (apply_eval_skip_sahi=False, apply_eval_top_k
    unset) leaves os.environ untouched."""
```

Use `monkeypatch.delenv("EVAL_SKIP_SAHI", raising=False)` and `monkeypatch.delenv("CLASSIFICATION_TOP_K", raising=False)` in fixtures so test isolation is real.

### `tests/unit/eval/test_skip_sahi.py`

Pins for the `EVAL_SKIP_SAHI` short-circuit inside `sahi_recovery_op`. Mock `sahi_recovery_impl` (the underlying implementation function imported from `pipeline_service.ops.sahi_recovery`) so the test asserts whether or not it was called.

```python
"""Tests for EVAL_SKIP_SAHI env-gated short-circuit in sahi_recovery_op.

The op signature reads (from pipeline_service/dagster_defs.py):
    @op(name='sahi_recovery', ...)
    def sahi_recovery_op(
        frames: list[Frame],
        per_detector_detections: list[FrameDetections],
        prompts: ...,
    ) -> list[FrameDetections]: ...

These tests invoke the op via build_op_context (Dagster's standard
unit-test helper) and assert behaviour around the env var.
"""

def test_skip_sahi_truthy_returns_empty_list_without_calling_impl(monkeypatch):
    """EVAL_SKIP_SAHI=1 → sahi_recovery_op returns [] (an empty
    list[FrameDetections]) AND sahi_recovery_impl is NOT called.
    Assert via mock.patch on
    'pipeline_service.dagster_defs.sahi_recovery_impl'."""

def test_env_absent_calls_impl_unchanged(monkeypatch):
    """EVAL_SKIP_SAHI not in os.environ → sahi_recovery_impl is called
    exactly once with the same args the op received. Default behaviour
    preserved verbatim."""

def test_falsy_strings_treated_as_skip_disabled(monkeypatch):
    """EVAL_SKIP_SAHI in {'0', 'false', 'False', ''} → impl IS called.
    Only truthy values ({'1', 'true', 'True', 'yes'}) trigger the
    short-circuit."""

def test_short_circuit_does_not_modify_caller_state(monkeypatch):
    """The empty-return path must not mutate the input
    per_detector_detections list (defensive copy / no in-place ops)."""
```

Implementation note for the truthy/falsy test: use the project's existing env-parsing convention if there is one (look in `pipeline_service/eval/run_eval.py` for the existing `env(...)` helper). If none exists locally, treat truthy as `value.strip().lower() in {"1", "true", "yes", "on"}` and everything else (including `""`, `"0"`, `"false"`) as falsy. **Pick whichever convention `run_eval.py` already uses and reuse it** — do not introduce a new parsing rule.

## Implementation details

### `gt_eval/runner.py`

Module-level imports:

```python
from __future__ import annotations

import hashlib
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from pipeline_service.dagster_defs import pipeline_job
# CorpusItem lives in the corpus walker; reuse, do not redefine.
from pipeline_service.eval.corpus_walker import CorpusItem
from pipeline_service.types import SceneObservation
```

Public surface:

```python
def single_image_pipeline_runner(
    image_path: Path,
    *,
    mime_type: str = "image/jpeg",
    apply_eval_skip_sahi: bool = False,
    apply_eval_top_k: int | None = None,
) -> SceneObservation:
    """Run the existing pipeline on one image and return its
    SceneObservation.

    Builds a synthetic single-frame CorpusItem, constructs the same
    Dagster run config the multi-frame burst path uses (one frame),
    and calls pipeline_job.execute_in_process(run_config=...).

    Optional knobs (env-gated; restored after the call):
      apply_eval_skip_sahi=True  → sets EVAL_SKIP_SAHI=1
      apply_eval_top_k=K         → sets CLASSIFICATION_TOP_K=str(K)

    On any internal op failure, returns a SceneObservation with
    flagged=True and errors populated; does NOT re-raise.
    """
```

Internal helpers (private):

- `_build_corpus_item(image_path: Path) -> CorpusItem` — `scene_id=f"lvis-{image_path.stem}"`, `capture_id="0"`, `frame_paths=[image_path]`.
- `_build_run_config(image_path: Path, *, mime_type: str) -> dict` — reads `image_path.read_bytes()` once, computes `sha256`, derives a stable `frame_id` (e.g. `f"{scene_id}-0"`), returns the `{"ops": {"frame_intake": {"config": {"frames": [...]}}}}` shape. **Look at how `corpus_walker.default_pipeline_runner` constructs its run config and mirror the exact key paths.**
- `_env_override(name: str, value: str | None) -> contextmanager` — context manager that sets `os.environ[name] = value` on enter (only if `value is not None`), and on exit restores the prior value (or deletes the key if it was previously absent). Must be exception-safe.
- `_extract_scene_observation(execute_result) -> SceneObservation` — pulls the `assemble_result` op's output. If `execute_result.success is False` or extraction raises, builds a flagged `SceneObservation` (empty detections, `flagged=True`, `errors=[<op_name or "pipeline">]`).

The control flow inside `single_image_pipeline_runner`:

1. Build the synthetic `CorpusItem` (kept locally for logging / debugging; not passed to Dagster — the run config is what `pipeline_job` consumes).
2. Build the run config.
3. Stack two `_env_override` context managers: `EVAL_SKIP_SAHI` (set to `"1"` only when `apply_eval_skip_sahi is True`) and `CLASSIFICATION_TOP_K` (set when `apply_eval_top_k is not None`).
4. Inside the env stack, call `pipeline_job.execute_in_process(run_config=run_config, raise_on_error=False)`.
5. Outside the stack, extract the `SceneObservation` via `_extract_scene_observation` and return it.

The whole function is `try`/`except`-wrapped at the outermost scope: any unhandled exception (e.g. import errors, malformed image) is converted to a flagged `SceneObservation` with `errors=["runner_unhandled: " + repr(exc)]`. This is the contract `test_pipeline_op_failure_surfaces_as_flagged_not_raised` pins.

### `dagster_defs.py` edit — `sahi_recovery_op`

Locate the existing op (around line 251 in `pipeline_service/dagster_defs.py`):

```python
@op(name="sahi_recovery", out=Out(list, description="§3.6 — tiled re-detect"))
def sahi_recovery_op(
    frames: list[Frame],
    per_detector_detections: list[FrameDetections],
    prompts,
) -> list[FrameDetections]:
    return sahi_recovery_impl(...)
```

Insert the env-gated short-circuit at the top of the function body:

```python
@op(name="sahi_recovery", out=Out(list, description="§3.6 — tiled re-detect"))
def sahi_recovery_op(
    frames: list[Frame],
    per_detector_detections: list[FrameDetections],
    prompts,
) -> list[FrameDetections]:
    # GT-eval env-gated short-circuit (see eval/gt_eval/runner.py).
    # Default behaviour (env var absent) is unchanged.
    if _eval_skip_sahi_enabled():
        return []
    return sahi_recovery_impl(...)
```

Add a private module-level helper `_eval_skip_sahi_enabled()` that reads `os.environ.get("EVAL_SKIP_SAHI", "")` and applies the same truthy parser the rest of `pipeline_service.eval` uses. **Do not** import this helper from `gt_eval/` — `dagster_defs.py` must not depend on `gt_eval/` (avoid a circular import; `gt_eval/runner.py` already imports `pipeline_job` from `dagster_defs`). Put the helper inline in `dagster_defs.py`.

Constraints on the edit:
- Must not change the op's signature, name, or `Out` shape.
- Must not change the impl call's argument order.
- Must not log at `INFO` on the no-op path during normal operation (eval runs would spam logs); use `DEBUG` if any logging is added.
- The existing test suite under `tests/unit/ops/test_sahi_recovery.py` must continue to pass unchanged — verify locally by running `cd pipeline-service && uv run pytest tests/unit/ops/test_sahi_recovery.py -q` after the edit.

## Acceptance criteria

- `pipeline_service.eval.gt_eval.runner.single_image_pipeline_runner` exists, is a plain top-level function, and is patchable in tests.
- Calling the shim with a fixture image and `apply_eval_skip_sahi=True, apply_eval_top_k=3` (with `pipeline_job.execute_in_process` mocked) sets and unsets both env vars symmetrically, never leaks state between calls.
- The shim never raises out; every internal failure surfaces as a flagged `SceneObservation`.
- With `EVAL_SKIP_SAHI=1` set, `sahi_recovery_op` returns `[]` without invoking `sahi_recovery_impl`.
- With `EVAL_SKIP_SAHI` unset (or falsy), `sahi_recovery_op` behaviour is byte-identical to pre-PR.
- The two new test files (`test_runner.py`, `test_skip_sahi.py`) pass under `uv run --project pipeline-service pytest tests/unit/eval/test_runner.py tests/unit/eval/test_skip_sahi.py -q`.
- The existing `tests/unit/ops/test_sahi_recovery.py` continues to pass without modification.
- `make lint` (or the project's TypeScript-equivalent — `uv run ruff check` here) passes on the new and modified files.

## Notes for the implementer

- The `apply_eval_top_k` parameter was added during plan iteration; it is documented in the manifest as `apply_eval_top_k` and corresponds to env var `CLASSIFICATION_TOP_K`. Section 08's orchestrator passes both `apply_eval_skip_sahi` and `apply_eval_top_k` from `GtEvalConfig`.
- Use `os.environ` directly (with the context-manager save/restore pattern). Do not rely on `monkeypatch` semantics in production code — those are test-only.
- The fixture image used by `test_runner.py` is one of the 5 small JPEGs under `tests/replay/fixtures/eval/images/` laid down by section-01.
- Keep the `_env_override` context manager exception-safe (`finally`-block restore). One missed cleanup leaks `EVAL_SKIP_SAHI` into the next image's pipeline run and silently wrecks the eval.
- The `pipeline_job` import path (`from pipeline_service.dagster_defs import pipeline_job`) is the canonical entry; do not reach into Dagster repository defs.