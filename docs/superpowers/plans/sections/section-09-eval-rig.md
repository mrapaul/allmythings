Now I have all the context I need. Let me write the section content for section-09-eval-rig.

## section-09-eval-rig — Evaluation rig, metrics, thresholds, starter corpus, smoke integration

### Goal

Add a deterministic evaluation harness for the Dagster pipeline so we can answer "is this build at least as good as the last one?" without human ground-truth labels. The rig has three deliverables:

1. `pipeline-service/eval/run_eval.py` — single CLI entrypoint that runs the pipeline against a local corpus and writes `last-metrics.json`.
2. `pipeline-service/eval/metrics.py` — pure-function metric calculators over `SceneObservation` lists.
3. `pipeline-service/eval/thresholds.json` — the CI-gating thresholds, plus `make eval` integration that exits non-zero on violation.

It also (a) defines the **starter-corpus capture protocol** as the human-driven first task of the section and (b) extends `scripts/smoke.sh` so `make smoke` runs a one-scene synthetic burst through the full DAG end-to-end.

This section blocks **section-10-cleanup-cutover** (Phase 5 deletion of Temporal): Phase 5 may not start until **two consecutive `make eval` runs are green** against the captured corpus.

### Dependencies (reference only — do not duplicate)

- **section-07-agreement-and-diagnosis** (required): supplies the populated `SceneObservation` shape with `agreementCoverage`, `agreementPrecision`, `selfDiagnosisTriggered`, `flagged`, `flagReason`, `errors[]`, and per-detection `agreementScore` / `contributingSignals`. The metric functions read these fields directly; if section-07 is not in place those fields will not be populated and the metrics will degenerate to zero.
- **section-08-mobile-rewrite** (helpful, not required): once mobile is on the new contract, the starter-corpus captures use the real burst-capture path. Until then, the corpus can be hand-recorded with `curl` against `/v1/detect` against any 3-frame WebP set.
- **section-01-pipeline-skeleton** (required): the eval rig calls Dagster ops via `materialize()` directly (in-process), so it relies on the `Definitions` factory and `assemble_result` op shipped in section-01 / refined in 03–07.
- **section-06-fusion** (transitive, required): produces the populated `contributingSignals` that drive most metrics.

### Background context (self-contained)

The pipeline produces `SceneObservation` records (mirror of the TypeScript shape in `api-service/src/types/pipeline.ts`). Relevant fields the metrics consume:

```python
class SceneObservation:                         # pipeline_service/types.py
    sceneId: str
    runId: str
    frameIds: list[str]
    detections: list[PipelineDetection]
    agreementCoverage: float                    # already populated by agreement_scoring op
    agreementPrecision: float                   # already populated by agreement_scoring op
    selfDiagnosisTriggered: bool
    rerunDepth: int
    flagged: bool
    flagReason: Optional[Literal[
        'empty_detection_set', 'single_source_run',
        'diagnosis_budget_exhausted', 'assemble_failed', str
    ]]
    processingMs: int
    errors: list[OpError]                       # { op, code, message }
    tileErrors: list[TileError]
```

Each `PipelineDetection` carries `cropEmbeddingB64` (int8-quantised, 768 bytes), `primaryLabel`, `agreementScore`, `confidence`, `contributingSignals[]`.

Because there is no human ground truth (explicit non-goal), all metrics are either (a) deterministic transforms of `SceneObservation` fields the pipeline already computed, or (b) consistency metrics over **paired captures of the same physical scene** (`multi_frame_stability`).

### Starter-corpus capture protocol (FIRST TASK of this section)

This is a human task. It must be done before any CI gating activates.

- **Layout:** `pipeline-service/eval/corpora/` is gitignored. Inside, each scene is a folder containing the 3 WebP frames of one burst:

  ```
  pipeline-service/eval/corpora/
    room01/
      angle-a/
        capture-1/   frame-0.webp  frame-1.webp  frame-2.webp
        capture-2/   ...
      angle-b/
        capture-1/   ...
        capture-2/   ...
      angle-c/
        capture-1/   ...
        capture-2/   ...
    room02/
      ...
  ```

- **Volume:** 5 rooms × 3 angles × 2 captures = **30 scenes**, each scene = one 3-frame burst. Two captures per `(room, angle)` are mandatory because `multi_frame_stability` is a paired metric.
- **Capture method:** use the actual mobile burst capture flow (after section-08 ships) or `curl -F` upload of three pre-recorded WebPs. EXIF GPS must already be stripped (mobile encoder does this; if uploading by hand, strip via `exiftool`).
- **No manual labelling.** No bounding-box annotation, no class labels. Only the raw bursts. The whole point of agreement-driven scoring is that it does not need labels.
- **Pairing convention:** within `room01/angle-a/`, `capture-1/` and `capture-2/` are the paired bursts whose detection sets are compared via `multi_frame_stability`.
- **Until the corpus exists**, `make eval` **reports without gating** (informational mode). Detection of "corpus empty" is via `len(list(corpora_dir.iterdir())) == 0`.

### Files to create

```
pipeline-service/
  eval/
    __init__.py                 # NEW
    run_eval.py                 # NEW — CLI entrypoint
    metrics.py                  # NEW — pure metric functions
    thresholds.json             # NEW — gating values
    corpora/                    # gitignored; created by capture protocol
    last-metrics.json           # gitignored; produced by run_eval.py
    changelog.md                # NEW — appended to after every Phase-4 sub-phase
                                #       (already referenced by claude-plan §10 Phase 4)
  tests/
    unit/eval/
      __init__.py               # NEW
      test_metrics.py           # NEW
      test_thresholds.py        # NEW (light — just schema sanity)
    integration/
      test_eval_rig.py          # NEW
      test_smoke_dag.py         # NEW (one-scene synthetic burst, full DAG)
    fixtures/
      eval/
        synthetic_corpus/       # NEW — committed mini-corpus (1–2 scenes, deterministic)
          scene_01/
            capture-1/ frame-0.webp frame-1.webp frame-2.webp
            capture-2/ frame-0.webp frame-1.webp frame-2.webp
        synthetic_observations.json  # pre-canned SceneObservation list for unit tests
```

### Files to modify

- `pipeline-service/.gitignore` — add `eval/corpora/`, `eval/last-metrics.json`.
- `Makefile` (repo root) — add `eval:` target that shells into `pipeline-service` and runs `uv run python -m pipeline_service.eval.run_eval`.
- `scripts/smoke.sh` — add a step that runs the one-scene synthetic burst through `/v1/detect` (or directly via `materialize()` if the sidecar is not running in smoke mode) and asserts a non-error `SceneObservation` is returned within the configured smoke timeout.
- `pipeline-service/pyproject.toml` — register `pipeline-service-eval = "pipeline_service.eval.run_eval:main"` console script (optional but tidier than `python -m`).

### Test command for this section

```
cd pipeline-service && uv run pytest tests/unit/eval tests/integration/test_eval_rig.py tests/integration/test_smoke_dag.py
```

### Tests FIRST

Write all of the following before any implementation. Every model call inside the eval-rig integration tests is mocked — real-model integration is the manual `make eval` operator workflow, never the pytest suite (per the plan's determinism rule). For the smoke-DAG test, `florence_detect`, `grounding_dino_detect`, `effsam_segment`, `vlm_prompt_expansion`, and `classification_refine` are wired to fakes via the existing `pipeline-service/tests/conftest.py` fixtures (set up in section-01).

#### `pipeline-service/tests/unit/eval/test_metrics.py`

Stubs/docstrings only — flesh out assertions in implementation:

```python
"""
Unit tests for pipeline_service.eval.metrics.

All tests use synthesised SceneObservation lists from
tests/fixtures/eval/synthetic_observations.json so they are deterministic
and require no model calls.
"""

# Test: agreement_coverage_avg over a list of SceneObservations returns the mean
#       of each observation's agreementCoverage field.
# Test: agreement_coverage_avg on empty list returns 0.0 (NOT NaN).
# Test: agreement_precision_avg parallel to coverage.
# Test: multi_frame_stability(scene_a, scene_a) == 1.0 (identity).
# Test: multi_frame_stability between two SceneObservations whose detection
#       embeddings have zero pairs ≥ 0.85 cosine returns 0.0.
# Test: multi_frame_stability is the Jaccard:
#         |matched_pairs| / (|det_a| + |det_b| - |matched_pairs|)
#       where a "match" is cosine ≥ 0.85 between an a-detection and any
#       still-unmatched b-detection (greedy, deterministic by detection_id sort).
# Test: multi_frame_stability is symmetric: stability(a,b) == stability(b,a).
# Test: multi_frame_stability with one or both empty detection lists returns 0.0
#       UNLESS both are empty — both empty also returns 0.0 by convention
#       (consistency metric is undefined; choose 0.0 not NaN, document in docstring).
# Test: multi_frame_stability uses the int8-quantised cropEmbeddingB64 dequantised
#       (NOT the f16 server-side vector — eval is post-quantisation by design,
#       so device-side stability is what we measure).
# Test: self_diagnosis_trigger_rate counts runs with selfDiagnosisTriggered=True
#       over total runs; empty list → 0.0.
# Test: op_failure_rate counts runs with errors[] non-empty / total; empty → 0.0.
# Test: single_source_run_rate counts runs with flagReason == 'single_source_run'.
# Test: empty_detection_set_rate counts ONLY runs with flagReason ==
#       'empty_detection_set' (does NOT count every run that happens to have
#       zero detections — only flagged ones, since blank-scene runs intentionally
#       have empty detections without flagging).
# Test: every metric returns a float in [0.0, 1.0] for any non-empty input.
# Test: every metric is deterministic — two calls on the same input return ==.
```

Signatures the tests pin (place these in `metrics.py` as stubs first, type-only):

```python
def agreement_coverage_avg(observations: list[SceneObservation]) -> float: ...
def agreement_precision_avg(observations: list[SceneObservation]) -> float: ...
def multi_frame_stability(scene_a: SceneObservation,
                          scene_b: SceneObservation,
                          cosine_threshold: float = 0.85) -> float: ...
def self_diagnosis_trigger_rate(observations: list[SceneObservation]) -> float: ...
def op_failure_rate(observations: list[SceneObservation]) -> float: ...
def single_source_run_rate(observations: list[SceneObservation]) -> float: ...
def empty_detection_set_rate(observations: list[SceneObservation]) -> float: ...
```

#### `pipeline-service/tests/unit/eval/test_thresholds.py`

```python
# Test: thresholds.json parses as JSON.
# Test: thresholds.json has every required key the gating loop reads
#       (agreement_coverage_min, dedup_precision_min, op_failure_rate_max,
#        self_diagnosis_trigger_rate_max, single_source_run_rate_max,
#        empty_detection_set_rate_max).
# Test: every "max" key value is in [0.0, 1.0]; every "min" key value is in [0.0, 1.0].
# Test: the section-09 documented gates are honoured as the defaults:
#         agreement_coverage_min      == 0.70
#         dedup_precision_min         == 0.88   (=== agreement_precision_min in
#                                                    metrics; we keep both names
#                                                    for back-compat with §6.3
#                                                    but assert one canonical key)
#         op_failure_rate_max         == 0.05
#       (the §6.3 secondary "warn" gates are recorded in thresholds.json but
#        loaded into a separate "warn" bucket — see run_eval logic).
```

#### `pipeline-service/tests/integration/test_eval_rig.py`

```python
"""
Integration tests for run_eval.py CLI behaviour.

Uses tests/fixtures/eval/synthetic_corpus/ and tests/fixtures/eval/synthetic_observations.json.
Pipeline ops are stubbed to return canned per-scene observations so the eval rig
itself is the unit under test — NOT the model stack.
"""

# Test: run_eval against the committed synthetic corpus produces eval/last-metrics.json
#       with every metric key present.
# Test: last-metrics.json schema — top-level keys match the metric function names;
#       values are floats; an additional "corpus" object reports
#       { rooms, scenes, captures } counts.
# Test: thresholds.json honoured — when synthetic observations are good (mocked
#       to return high coverage), exit code 0.
# Test: thresholds.json honoured — when synthetic observations are bad (mocked
#       to return coverage 0.10), exit code 1, and stderr names the failed
#       gate(s) (e.g., "agreement_coverage 0.10 < 0.70").
# Test: missing corpora/ directory entirely → exit code 1 with clear stderr
#       ("corpora directory not found at ...").
# Test: empty corpora/ directory → "informational mode": metrics still emitted,
#       last-metrics.json still written, exit code 0 EVEN IF metrics would fail
#       gating. The mode is reflected in last-metrics.json as
#       { "mode": "informational", ... }; gating mode reports { "mode": "gated", ... }.
# Test: --no-gate flag forces informational mode regardless of corpus presence
#       (allows running locally without firing CI alarms while iterating).
# Test: changelog.md is appended (NOT overwritten) on every successful run with
#       a one-line summary: "<ISO date> <git sha> coverage=X.XX precision=X.XX ..."
# Test: run_eval logs use the redacting formatter from §8.3 (no full prompt content
#       in stdout; structural shape only).
```

#### `pipeline-service/tests/integration/test_smoke_dag.py`

```python
"""
Smoke test: one synthetic scene flows through the full Dagster DAG via
materialize(). All model clients are wired to fakes from conftest.py.
This test exists in both the pipeline-service test suite AND is invoked
indirectly by scripts/smoke.sh for repo-wide smoke.
"""

# Test: full Definitions().materialize_in_process() over a 3-frame synthetic
#       burst produces a SceneObservation with detections >= 1 (the fakes are
#       seeded to emit at least one detection).
# Test: the run completes within SMOKE_TIMEOUT_S seconds (default 60).
# Test: agreement_scoring populated coverage/precision (NOT NaN).
# Test: assemble_result did not produce flagReason='assemble_failed'.
# Test: tile_errors is an empty list under the synthetic happy path.
# Test: no orphan files written outside ~/allmythings-data/photos/{sha256}.{ext}
#       (use tmp_path to redirect; assert directory contents at end).
```

#### `scripts/smoke-assertions.ts` extension

The existing assertions file (touched in section-01 and section-10) gains:

```ts
// Test: scripts/smoke.sh invokes the pipeline-service synthetic-burst smoke step
//       AND asserts the returned SceneObservation has at least one detection,
//       processingMs > 0, and flagReason is undefined or in the allowed set.
// Test: the synthetic-burst fixture lives at the path advertised in this section
//       (pipeline-service/tests/fixtures/eval/synthetic_corpus/scene_01/).
```

(Do not duplicate the orchestrator-level assertions already covered by section-01.)

### Implementation details

Implement only after the tests above are red.

#### `pipeline-service/eval/metrics.py`

Pure functions, no I/O, no Dagster imports. Stateless. Each docstring documents empty-input behaviour explicitly.

- All functions accept either a list of `SceneObservation` or, for `multi_frame_stability`, two single observations.
- `multi_frame_stability`'s matching loop:
  1. Decode `cropEmbeddingB64` for each detection on both sides — int8 → float, divide by 127, L2-normalise.
  2. Sort detections by `detection_id` (lexicographic) on both sides for determinism.
  3. Greedy match: for each `a` in `scene_a.detections`, find the highest-cosine still-unmatched `b` in `scene_b.detections`; if cosine ≥ `cosine_threshold`, mark matched.
  4. Return `len(matched_pairs) / (len(detections_a) + len(detections_b) - len(matched_pairs))`.
- All metric returns are clipped to `[0.0, 1.0]` defensively.

#### `pipeline-service/eval/thresholds.json`

```json
{
  "version": 1,
  "gating": {
    "agreement_coverage_min": 0.70,
    "dedup_precision_min": 0.88,
    "op_failure_rate_max": 0.05
  },
  "warn": {
    "agreement_precision_min": 0.40,
    "self_diagnosis_trigger_rate_max": 0.30,
    "single_source_run_rate_max": 0.05,
    "empty_detection_set_rate_max": 0.02
  }
}
```

The two buckets matter: the section description says CI gates on the three "gating" keys; the §6.3 table's other entries are emitted as warnings (logged to stderr, last-metrics.json reflects status, but exit code stays 0 unless a gating threshold trips).

#### `pipeline-service/eval/run_eval.py`

CLI structure (argparse, no click dependency to keep imports light):

```python
def main(argv: list[str] | None = None) -> int:
    """
    Entry point. Returns shell exit code (0 success / 1 failure).
    Discovers corpus, runs each scene through the in-process Dagster DAG via
    materialize_in_process(), aggregates SceneObservations, computes metrics,
    writes last-metrics.json, appends to changelog.md, applies gating.

    Flags:
      --corpus PATH        override eval/corpora/ default
      --thresholds PATH    override eval/thresholds.json
      --output PATH        override eval/last-metrics.json
      --no-gate            force informational mode
      --jobs N             parallel scenes (default 1; honour the in-process
                           Semaphore — set to 1 by default to match production)
    """
```

Pseudocode — keep functions short, single-purpose:

1. `_discover_corpus(path) -> list[ScenePair]`: walk `room*/angle*/capture-*` dirs; group `(room, angle)` capture-1 + capture-2 into a `ScenePair`. Single-capture angles raise a warning but do not fail.
2. `_run_scene(burst_paths) -> SceneObservation`: call `Definitions().get_job_def("...")` — or, more directly, `materialize_in_process` with `run_config={"resources": {...}, "ops": {"frame_intake": {"config": {"photo_paths": [...]}}}}`. Reuse the same `materialize()` invocation the FastAPI sidecar uses (factor it out into `pipeline_service.api.server._run_pipeline()` if not already shared, OR import from there).
3. `_aggregate_metrics(all_observations, paired) -> MetricsReport`: applies every function from `metrics.py`. For `multi_frame_stability`, reduce over the list of `ScenePair` → mean of per-pair stabilities.
4. `_apply_gates(report, thresholds_dict) -> tuple[exit_code, failed_gates_list, warnings_list]`.
5. `_write_artefacts(report, output_path, changelog_path, mode)`.
6. `main()` orchestrates and returns exit code.

`MetricsReport` is a Pydantic model (or `dataclass` + `asdict()`) so JSON serialisation is trivial:

```python
class MetricsReport(BaseModel):
    mode: Literal['gated', 'informational']
    corpus: CorpusSummary             # rooms, scenes, captures
    agreement_coverage: float
    agreement_precision: float
    multi_frame_stability: float      # mean over paired captures
    self_diagnosis_trigger_rate: float
    op_failure_rate: float
    single_source_run_rate: float
    empty_detection_set_rate: float
    failed_gates: list[str]           # populated only in gated mode
    warnings: list[str]
    git_sha: str                      # captured from `git rev-parse HEAD`
    timestamp: datetime
```

#### `pipeline-service/eval/changelog.md`

Append-only newline-separated summary lines. Format:

```
2026-04-29T12:00:00Z  abc1234  mode=gated  cov=0.78 prec=0.46 stab=0.81 trig=0.10 fail=0.02 ssr=0.00 eds=0.00  PASS
```

Important: the `pipeline-service/scripts/check-phase-gates.py` from section-10 reads this file and asserts the **last 2 entries** end with `PASS` and `mode=gated` before Phase 5 may proceed (per `claude-plan-tdd.md` §10).

#### `Makefile` integration

```make
.PHONY: eval
eval:
	cd pipeline-service && uv run python -m pipeline_service.eval.run_eval

.PHONY: eval-info
eval-info:
	cd pipeline-service && uv run python -m pipeline_service.eval.run_eval --no-gate
```

#### `scripts/smoke.sh` extension

After the existing pipeline-service health check, add one block that runs the one-scene synthetic burst through `/v1/detect` (preferred — exercises the full Fastify-to-pipeline path) when the orchestrated stack is up, falling back to direct `materialize()` invocation when only `pipeline-service` is up. Use the existing fixtures at `pipeline-service/tests/fixtures/eval/synthetic_corpus/scene_01/capture-1/frame-{0,1,2}.webp`.

The smoke step asserts (via `scripts/smoke-assertions.ts`):
- HTTP 200 within 60s, OR HTTP 202 followed by a `/v1/detect/status/:runId` poll resolving to `succeeded` within 60s.
- Response is a valid `SceneObservation`.
- `flagReason` is either absent or one of the documented values (no surprise reasons).
- `processingMs > 0`.

The smoke step does NOT call `make eval` itself — `make eval` is for Phase 7 corpus runs; smoke is for one-scene end-to-end liveness.

### Done checklist

- [ ] `pipeline-service/eval/metrics.py` exists; every function in the §7.2 list is implemented; all `tests/unit/eval/test_metrics.py` tests pass.
- [ ] `pipeline-service/eval/thresholds.json` exists with the three gating keys at documented defaults; `tests/unit/eval/test_thresholds.py` passes.
- [ ] `pipeline-service/eval/run_eval.py` exists; both gated and informational modes are reachable; `tests/integration/test_eval_rig.py` passes.
- [ ] `pipeline-service/eval/changelog.md` exists with one initial entry from a `--no-gate` informational run on the synthetic corpus.
- [ ] `pipeline-service/eval/corpora/` is gitignored; `pipeline-service/eval/last-metrics.json` is gitignored.
- [ ] Synthetic mini-corpus committed at `pipeline-service/tests/fixtures/eval/synthetic_corpus/scene_01/` (one paired capture, two bursts of 3 WebP frames each, deterministic content).
- [ ] `pipeline-service/tests/fixtures/eval/synthetic_observations.json` committed and consumed by `tests/unit/eval/test_metrics.py`.
- [ ] `make eval` and `make eval-info` targets in repo-root `Makefile` work and have the right exit-code semantics.
- [ ] `scripts/smoke.sh` runs the one-scene synthetic burst end-to-end; `scripts/smoke-assertions.ts` extended; `tests/integration/test_smoke_dag.py` passes.
- [ ] **Starter-corpus capture protocol documented in this section is followed by the human operator** before Phase 5 / section-10 may proceed: 30 scenes captured under `pipeline-service/eval/corpora/`, `make eval` returning exit 0 (gated mode) on **two consecutive runs**, with both entries appended to `changelog.md`.
- [ ] Logs from `run_eval.py` route through the redacting formatter introduced in section-01's `pipeline_service/log_redaction.py`. `caplog`-based assertion in tests confirms no full prompt content leaks.
- [ ] No real Florence / Ollama / Grounding-DINO / DINOv2 calls happen inside `pytest`. Only `make eval` against the actual corpus exercises the live stack.