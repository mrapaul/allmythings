Now I have all the context needed. Let me generate the section content.

# Section 01: Pipeline Skeleton

## Overview

Stand up a brand-new `pipeline-service/` Python project — a FastAPI sidecar that hosts a Dagster `Definitions` graph and runs jobs **in-process** via `materialize()`. No Dagster daemon. No real model calls in this section: middle ops are typed pass-through stubs with explicit empty-set semantics, and model loaders are no-ops. The job of this section is to make the skeleton **end-to-end runnable** so subsequent sections can drop real ops in without touching the sidecar plumbing, idempotency, backpressure, retention, or log redaction.

This is **section 01 of 10** and has **no upstream dependencies**. It blocks sections 02 (Fastify client) and 03 (legacy-equivalent ops).

## Background context (self-contained)

### Why a Python sidecar at all

The current `api-service/` (Fastify TS) orchestrates Florence-2 + Qwen-VL via Temporal workers in TypeScript. We are replacing the orchestration core with a **Dagster-driven Python pipeline** because the new pipeline is multi-pass, multi-model, multi-frame, and the ML libraries we want to call (DINOv2 via MLX, Grounding DINO, EfficientSAM, sentence-transformers, SAHI tiling, FAISS) all have first-class Python tooling and would be painful to bridge from Node. Fastify is **kept** at the edge for HTTP, auth, photo storage, and Bonjour discovery; the pipeline-service runs as a **loopback HTTP sidecar** invoked from `pipeline.client.ts` (added in section 02).

### Why in-process Dagster

Dagster has two execution shapes: a daemon-driven multi-process runner, or `materialize()` called from inside any Python process. We use the latter. The FastAPI sidecar imports `Definitions` and runs jobs inside its own event loop. Concurrency is gated by an `asyncio.Semaphore` (default 1), equivalent to `QueuedRunCoordinator(max=1)` but simpler. The Dagster webserver runs separately as a **read-only UI** pointed at the same `DAGSTER_HOME` for run history and lineage. There is **no Dagster daemon process**.

Tradeoffs (locked in §11.6 of the plan): simpler ops, faster cold start; if the sidecar crashes mid-run, the run shows as "failed" in the UI and the circuit-breaker on the Fastify side handles the surface. Out-of-scope process supervisor.

### What this section does NOT include

- No real model code (DINOv2, gdino, EffSAM, Florence HTTP, Ollama). All loaders are no-op stubs that subsequent sections fill in.
- No real fusion / dedup / agreement math. Middle ops are pass-through with empty-set behaviour only.
- No Fastify integration — that lives in section 02.
- No mobile changes — that lives in section 08.

## Test command (this section)

This section's tests live in `pipeline-service/`. Run with:

```
cd pipeline-service && uv run pytest
```

Per the project manifest, `python-uv` + `uv run pytest` is the default polyglot test runner.

---

## Tests FIRST (write these before any production code)

Per the project's TDD discipline, write the failing tests first. **Stubs mean stubs** — the descriptions below are scaffolding; the implementer writes assertions, fixtures, and mocks. Every model call in tests is mocked (no live HTTP).

### `pipeline-service/tests/test_repo_structure.py`

A single structure test asserting the directory layout from §2 of the plan exists. Specifically:

```python
# Test: pipeline_service/__init__.py exists
# Test: pipeline_service/dagster_defs.py exists
# Test: pipeline_service/api/server.py exists
# Test: pipeline_service/api/schemas.py exists
# Test: pipeline_service/ops/{frame_intake,scene_embedding,vlm_prompt_expansion,
#       florence_detect,grounding_dino_detect,sahi_recovery,effsam_segment,
#       box_fusion,crop_embedding,cross_pass_dedup,cross_frame_dedup,
#       classification_refine,agreement_scoring,self_diagnosis,
#       assemble_result}.py all exist
# Test: pipeline_service/models/{florence_client,ollama_client,grounding_dino,
#       effsam,dinov2,label_encoder}.py all exist (stubs are fine)
# Test: pipeline_service/storage/{faiss_index,prompt_cache,retention}.py exist
# Test: pipeline_service/{log_redaction,types,config}.py exist
# Test: eval/{run_eval.py,metrics.py,thresholds.json} exist
# Test: pyproject.toml + uv.lock exist
```

### `pipeline-service/tests/unit/test_op_concerns.py` (cross-cutting §3.0)

```python
# Test: every op exposes deterministic ordering — given the same input
#       in two different list orders, output is byte-equal.
#       (For section 01, this only needs to assert the contract on
#       frame_intake + assemble_result + the pass-through stubs.)
# Test: every numeric op produces 0.0 (not NaN) for empty input.
#       (Pass-through stubs in section 01 must already obey this.)
# Test: log_redaction strips full prompt/attribute content from log records
#       and replaces with structural shape (len + sample).
# Test: log_redaction is enabled by default in pipeline_service.api.server
#       — verified by capturing logs through caplog.
# Test: replay-test infrastructure: given a fixture under tests/replay/fixtures/,
#       replaying the op produces byte-equal output to the recorded one.
#       (For section 01, exercise this on assemble_result with a tiny fixture.)
```

Note: the Ollama-semaphore concurrency test from §3.0 lives in section 03 (where the real Ollama client is wired). Section 01 only needs the `OllamaClient` class signature in place (no-op).

### `pipeline-service/tests/unit/ops/test_frame_intake.py` (§3.1)

```python
# Test: accepts list of 3 frames, returns 3 Frame records with EXIF orientation preserved
# Test: strips EXIF GPS / timestamp tags from emitted Frame
# Test: rejects unsupported mime → raises UnsupportedMediaTypeError (non-retryable)
# Test: one frame fails decoding, two succeed → emits Frame(decoding_failed=True)
#       for the bad one, real Frames for the good ones, op succeeds
# Test: ALL frames fail decoding → raises UnsupportedMediaTypeError
# Test: writes original bytes to ~/allmythings-data/photos/{sha256}.{ext}
#       (use tmp_path fixture for the photo dir)
# Test: handles single-frame request payload (legacy v0 shape, defensive)
```

### `pipeline-service/tests/unit/ops/test_assemble_result.py` (§3.15)

```python
# Test: pure transformation — no model calls, no I/O
# Test: emits final JSON shape matching the SceneObservation type
# Test: try/except — Pydantic validation error inside the op produces a
#       minimal valid SceneObservation with flagged=True,
#       flag_reason="assemble_failed", and exception summary in errors[]
#       (the op does NOT raise)
# Test: tile_errors are aggregated across frames into the final
#       SceneObservation.tileErrors
# Test: errors[] from upstream ops are propagated unchanged
```

### `pipeline-service/tests/unit/test_passthrough_ops.py` (middle-op stubs for this section)

For section 01, the 13 middle ops between `frame_intake` and `assemble_result` are typed pass-through stubs. Test that each:

```python
# Test: typed pass-through — given the documented input type, returns the
#       documented output type unchanged or with the documented empty-set value.
# Test: empty input → numeric outputs are 0.0 (NOT NaN)
#       (e.g. agreement_scoring stub on empty observation → coverage=0.0,
#        precision=0.0; box_fusion stub on empty input → FusedFrame(fused=[]))
# Test: stub does not call any real model client (assert via mock)
# Test: stub annotates its output with `op_stubbed=True` somewhere observable
#       (e.g. Dagster asset metadata) so eval-rig in section 09 can detect it
```

The implementer should write one parametrised test that iterates over the 13 stub ops; do not duplicate per-op test files in this section — those arrive in sections 03–07.

### `pipeline-service/tests/integration/test_sidecar_api.py` (§4.2 — sidecar API)

```python
# Test: POST /runs returns 202 with run_id; new run materialises in Dagster
#       instance storage
# Test: idempotency: second POST with same idempotency_key while first is running
#       returns the same run_id (200, idempotent_hit=true, status=running)
# Test: idempotency: POST with same key after first succeeded returns cached result
#       (200, idempotent_hit=true, status=succeeded, result populated)
# Test: idempotency: POST with same key after failure → allowed (fresh run)
#       (preserves ALLOW_DUPLICATE_FAILED_ONLY contract)
# Test: GET /runs/:id returns current status with started_at, finished_at?
# Test: GET /runs/:id/wait?timeout_s=2 long-polls and resolves on completion event
# Test: GET /runs/:id/wait times out after timeout_s with current state, NOT 5xx
# Test: GET /runs/:id/timeline returns per-op timing including dynamic_outputs count
#       (for section 01, dynamic_outputs is always 0 because self_diagnosis is a stub)
# Test: backpressure — submitting 5 concurrent runs with max_queue_depth=4 →
#       the 5th gets 503 with queue_depth=4 and retry_after_s populated
# Test: idempotency_key MUST be sha256 of concatenated frame hashes
#       (server validates format / length, but not the content — content
#        validation is the caller's job)
# Test: sidecar binds to 127.0.0.1 only (assert via socket inspection)
# Test: model warm-up endpoint returns ready=false until startup task completes,
#       then ready=true (the task is a no-op in section 01 but the gate
#       infrastructure is exercised)
```

### `pipeline-service/tests/integration/test_dagster_retention.py` (§8.2 retention)

```python
# Test: storage/retention.prune_runs keeps the most-recent N runs
#       (default 200) and deletes older ones
# Test: schedule fires nightly per Dagster cron config
# Test: schedule is registered in Definitions and picked up by Dagster
#       instance (verify via Definitions().get_all_schedule_defs())
```

### `pipeline-service/tests/unit/test_log_redaction.py` (§8.3)

```python
# Test: redactor enabled by default in pipeline_service.api.server bootstrap
# Test: a log record carrying extra={"_redact": True, "prompts": [...]} is
#       formatted as "len=N, sample_first_3=[lowercased noun heads only]"
# Test: full prompt content is NOT present in the formatted log line
# Test: Dagster asset metadata is unchanged (full content preserved there)
#       — assert via reading back from instance storage
# Test: redactor is no-op for records without _redact=True flag
```

(VLM-redaction tests for `vlm_prompt_expansion` and `classification_refine` proper land in sections 04 and 03 respectively; section 01 only sets up the redaction **infrastructure**.)

### `pipeline-service/tests/replay/test_op_replay.py` infrastructure

```python
# Test: replay loader: given a fixture file under tests/replay/fixtures/{op}/{case}.json,
#       loads input + expected output as Pydantic dataclasses
# Test: replay runner: invokes the op on the loaded input and asserts byte-equal
#       JSON output against the recorded expected output
# Test: at least one fixture exists for assemble_result + frame_intake
#       (these are the only two real ops in section 01)
# Test: refresh-fixture mode (env var REPLAY_REFRESH=1) re-records expected
#       outputs — used in dedicated PRs for intentional contract changes
```

---

## Implementation details

### Directory layout (from §2 of the plan)

Create these files. Empty modules are fine for ops/models that other sections will fill in — but they must exist so imports resolve and the structure test passes.

```
pipeline-service/
├── pyproject.toml             # uv-managed
├── uv.lock
├── pipeline_service/
│   ├── __init__.py
│   ├── dagster_defs.py        # Definitions(): assets, schedules, sensors, jobs
│   ├── api/
│   │   ├── __init__.py
│   │   ├── server.py          # FastAPI app: POST /runs, GET /runs/:id,
│   │   │                         GET /runs/:id/wait (long-poll), /timeline, /health
│   │   └── schemas.py         # Pydantic request/response models
│   ├── ops/
│   │   ├── __init__.py
│   │   ├── frame_intake.py            # REAL in section 01
│   │   ├── scene_embedding.py         # PASS-THROUGH STUB
│   │   ├── vlm_prompt_expansion.py    # PASS-THROUGH STUB
│   │   ├── florence_detect.py         # PASS-THROUGH STUB
│   │   ├── grounding_dino_detect.py   # PASS-THROUGH STUB
│   │   ├── sahi_recovery.py           # PASS-THROUGH STUB
│   │   ├── effsam_segment.py          # PASS-THROUGH STUB
│   │   ├── box_fusion.py              # PASS-THROUGH STUB
│   │   ├── crop_embedding.py          # PASS-THROUGH STUB
│   │   ├── cross_pass_dedup.py        # PASS-THROUGH STUB
│   │   ├── cross_frame_dedup.py       # PASS-THROUGH STUB
│   │   ├── classification_refine.py   # PASS-THROUGH STUB
│   │   ├── agreement_scoring.py       # PASS-THROUGH STUB
│   │   ├── self_diagnosis.py          # PASS-THROUGH STUB (DynamicOut shape ready)
│   │   └── assemble_result.py         # REAL in section 01
│   ├── models/
│   │   ├── __init__.py
│   │   ├── florence_client.py         # NO-OP class shell
│   │   ├── ollama_client.py           # class shell with asyncio.Semaphore(1) per model
│   │   ├── grounding_dino.py          # NO-OP loader
│   │   ├── effsam.py                  # NO-OP loader
│   │   ├── dinov2.py                  # NO-OP loader
│   │   └── label_encoder.py           # NO-OP loader
│   ├── storage/
│   │   ├── __init__.py
│   │   ├── faiss_index.py             # NO-OP placeholder
│   │   ├── prompt_cache.py            # NO-OP placeholder
│   │   └── retention.py               # REAL nightly schedule in section 01
│   ├── log_redaction.py               # REAL in section 01
│   ├── types.py                       # REAL Pydantic dataclasses in section 01
│   └── config.py                      # REAL env-driven config in section 01
├── eval/
│   ├── run_eval.py                    # placeholder; full impl in section 09
│   ├── metrics.py                     # placeholder; full impl in section 09
│   ├── thresholds.json                # default thresholds; tuned in section 09
│   └── corpora/                       # gitignored
└── tests/
    ├── conftest.py                    # fixtures: fake model HTTP responders
    ├── unit/                          # see test list above
    ├── integration/                   # see test list above
    └── replay/
        ├── README.md                  # what op-replay means here
        ├── fixtures/                  # golden op-input/output JSON
        └── test_op_replay.py          # see above
```

Also at the project root: `scripts/start-pipeline.sh` (NEW).

### `pyproject.toml` (uv-managed)

Required dependencies (this section pins versions, sections 03+ add ML libs):

- `fastapi`
- `uvicorn[standard]`
- `pydantic >= 2`
- `dagster` + `dagster-webserver`
- `python-multipart` (FastAPI multipart support)
- `httpx` (for tests / future model clients)
- `pytest`, `pytest-asyncio`, `pytest-httpx`, `pytest-mock`
- `Pillow` (for frame_intake decoding/EXIF)
- `pyexiv2` or equivalent for EXIF strip-except-orientation (or use Pillow's `getexif()`)

Use `uv add <pkg>` so `uv.lock` is generated and committed. Do **not** add ML libraries (mlx, onnxruntime, torch, faiss, sentence-transformers) in this section — they're added in their respective sections.

### `pipeline_service/types.py` (Pydantic dataclasses)

Mirror of the TypeScript types in §5.1 of the plan. Section 01 must define **every** type used in section 01 plus the type signatures for stub ops to compile.

Types to define in this file — full schemas are spec'd in §5.1 (TS) and §5.2 (Py) of the plan; here we only enumerate what section 01 must put in place:

- `FrameId`, `RunId`, `SceneId`, `DetectionId` (all `str` aliases)
- `BBox` (`{x, y, width, height}` floats)
- `PipelineConfig` (full struct with thresholds + boxFusion + enabledDetectors)
- `Frame` (frame_id, rgb ndarray uint8, exif_orientation, captured_at, decoding_failed: bool)
- `SceneEmbedding` (frame_id, vector ndarray float16, embedded_at, embedding_failed: bool)
- `PromptList` (prompts, cached, source_models, degraded)
- `RawDetection`, `FrameDetections`, `FusedDetection`, `FusedFrame`
- `EmbeddedFrame`, `DedupedFrame`
- `ContributingSignal`, `TileError`
- `PipelineDetection`
- `SceneObservation` (sceneId, runId, frameIds, detections, agreementCoverage, agreementPrecision, selfDiagnosisTriggered, rerunDepth, flagged, flagReason, processingMs, errors[], tileErrors[])
- `RerunDirective` (next_depth, strictness_level, overrides, reason)
- `RunStatus`

Stub ops in this section take/return these types verbatim — that is what makes them "typed pass-through stubs."

### `pipeline_service/config.py`

Env-driven config. Reads:

- `PIPELINE_PORT` (default 14100)
- `PIPELINE_BIND_HOST` (default `127.0.0.1` — **must not** default to 0.0.0.0; assert in tests)
- `DAGSTER_HOME` (default `~/allmythings-data/dagster`)
- `PIPELINE_PHOTO_DIR` (default `~/allmythings-data/photos`)
- `PIPELINE_MAX_QUEUE_DEPTH` (default 4)
- `PIPELINE_RUN_RETENTION` (default 200)
- `PIPELINE_LOG_REDACTION` (default `true`)
- All threshold defaults from §5.1 `PipelineConfig.thresholds`

Loads `~/.allmythings.env` if present; environment variables override.

### `pipeline_service/dagster_defs.py`

Defines the Dagster `Definitions` object: every op (real or stubbed) is a Dagster `@op` or `@asset`, wired into a single graph matching the DAG diagram from §1 of the plan:

```
frame_intake (list[Frame]) → scene_embedding
  → vlm_prompt_expansion
  → florence_detect, grounding_dino_detect (parallel)
  → sahi_recovery → effsam_segment
  → box_fusion → crop_embedding
  → cross_pass_dedup → cross_frame_dedup
  → classification_refine → agreement_scoring
  → self_diagnosis (DynamicOut, fan-out in same DAG)
  → assemble_result
```

Also registers:
- The nightly retention schedule (`storage/retention.py::prune_runs`).
- A run-config defaulting layer that reads `pipeline_service/config.py` defaults so callers can omit `config` in `POST /runs`.

`self_diagnosis` in section 01 is a stub that **always yields the terminal branch** (no DynamicOut fan-out emitted) — but its signature already declares `DynamicOut` so section 07 can drop in real logic without re-wiring the graph.

### `pipeline_service/api/server.py` (FastAPI sidecar)

Endpoints (full schemas in §4.2 of the plan; replicated below for self-containment):

```
POST /runs
  Request:
    {
      idempotency_key:  string,    // sha256 of concatenated frame hashes
      photo_paths:      string[],  // server-local paths, op loads from these
      trace_id:         string,
      request_id:       string,
      config?:          PipelineConfig (optional override)
    }
  Response:
    202 { run_id, started_at, idempotent_hit: false }
    200 { run_id, started_at, idempotent_hit: true,
          status: "running" | "succeeded", result?: SceneObservation }
    503 { error: "queue_full", queue_depth: int, retry_after_s: int }

GET /runs/:run_id
  Response:
    200 { run_id, status, started_at, finished_at?, result?,
          error_code?, error_message? }

GET /runs/:run_id/wait?timeout_s=N
  // long-poll: subscribes to Dagster instance event stream
  // for this run; resolves as soon as terminal state OR timeout reached

GET /runs/:run_id/timeline
  Response:
    200 { run_id, ops: [{name, status, started_at, duration_ms,
                         retry_count, dynamic_outputs?}] }

GET /health
  Response:
    200 { ready: bool, model_warmup_complete: bool,
          dagster_home: string, queue_depth: int, max_queue_depth: int,
          florence_reachable: bool, ollama_reachable: bool,
          grounding_dino_loaded: bool }
```

Implementation notes:

1. **In-process materialise.** `POST /runs` schedules a Dagster job via `materialize()` running in a background `asyncio.Task`. The server keeps a `dict[run_id → asyncio.Task]` for completion-tracking and a `dict[idempotency_key → run_id]` for idempotency.
2. **Concurrency.** `asyncio.Semaphore(default=1)` around `materialize()`. Pending requests waiting on the semaphore count toward `queue_depth`. If `queue_depth > max_queue_depth`, return 503 with `retry_after_s` based on a moving average of last-N run durations (default seed: 5 s).
3. **Idempotency.**
   - If `idempotency_key` maps to a run in `running` state → return its `run_id, status="running", idempotent_hit=true` (200).
   - If it maps to a `succeeded` run with cached result → return result (200).
   - If it maps to a `failed`/`cancelled`/`timed_out` run → allow a fresh run (preserves the current Temporal `ALLOW_DUPLICATE_FAILED_ONLY` contract).
4. **Long-poll `/wait`.** Subscribe to Dagster's instance event stream for the given run via `DagsterInstance.event_log_storage`. Wake on terminal-state event OR `timeout_s`. Return the same shape as `GET /runs/:id`.
5. **Bind host.** `127.0.0.1` only (no inter-service auth in v1; documented non-goal in §11.8).
6. **Model warm-up startup task.** A FastAPI `lifespan` context that calls every loader in `pipeline_service/models/` on startup. In section 01 these are no-ops. The `/health` endpoint reports `ready=false` until the lifespan startup completes; readiness gates `POST /runs`. Subsequent sections (03+) replace the no-ops with real warm-up forward passes against synthetic 1×1 black images.
7. **Trace propagation.** Forward `traceparent` and `X-Request-Id` headers from the incoming request into Dagster run tags (`traceId`, `requestId`, `photoSha256=idempotency_key`) so traces in Tempo and runs in Dagster cross-navigate.

### `pipeline_service/api/schemas.py`

Pydantic v2 models matching §4.2 wire shapes:

- `LaunchRunRequest`, `LaunchRunResponse202`, `LaunchRunResponse200`, `QueueFullResponse503`
- `GetRunResponse`
- `WaitRunQuery` (timeout_s with sensible bounds: 1..60)
- `TimelineResponse`, `TimelineOp`
- `HealthResponse`

These are wire types (camelCase or snake_case must match the TS contract in §5.1; the TS contract uses `idempotency_key`/`photo_paths`/`trace_id`/`request_id` snake_case for the wire and camelCase inside SceneObservation — preserve this, the integration test in section 02 round-trips JSON to keep them in sync).

### `pipeline_service/ops/frame_intake.py` (real op — §3.1)

**Input:** `LaunchRunRequest` payload as `frames: list[{photo_bytes, sha256, frame_id, mime_type}]` plus the trace metadata. v1 sends exactly **3 frames** (the burst); the input shape is a list so v2 multi-burst doesn't break the contract.

**Output:** `list[Frame]` where each `Frame` has `frame_id, rgb_tensor (H,W,3, uint8), exif_orientation, captured_at, decoding_failed`.

**Behaviour:**

1. For each input, decode (jpeg/png/webp via Pillow), strip EXIF except `Orientation`, write the bytes to `~/allmythings-data/photos/{sha256}.{ext}`.
2. Emit `Frame(decoding_failed=False, ...)` on success.
3. If a single frame fails decoding, emit it as `Frame(decoding_failed=True)` and continue — the run can still proceed with the remaining frames; agreement signal will simply be lower.
4. If **all** frames fail decoding → raise `UnsupportedMediaTypeError` (non-retryable; aborts the run via Dagster's `Failure` policy).

### `pipeline_service/ops/assemble_result.py` (real op — §3.15)

Pure transformation — no model calls, no I/O. Wraps body in `try / except`: a Pydantic validation error or unexpected `None` produces a **minimal valid** `SceneObservation` with `flagged=True, flag_reason="assemble_failed"`, exception summary in `errors[]`, rather than raising into Dagster's job-failed state. The mobile must be able to render *something* even if the last op blew up.

For section 01, the input chain is: `frame_intake → 13 pass-through stubs → assemble_result`. The pass-through stubs generate empty `SceneObservation`-shaped data (zero detections, zero coverage, zero precision); `assemble_result` emits that as a valid empty `SceneObservation` with the run-id and frame-ids populated, `processingMs` measured.

### Pass-through stubs for the 13 middle ops

Each stub:
1. Has the **exact** Dagster op signature its real version will have (input/output Pydantic types from `types.py`).
2. Returns the documented **empty-set** value for its output type:
   - `scene_embedding`: returns `[SceneEmbedding(frame_id=f.frame_id, vector=zeros, embedding_failed=False) for f in frames]` (zero vector but `embedding_failed=False` is fine for the stub — empty-set semantics define the shape, real failure handling lands in section 04).
   - `vlm_prompt_expansion`: `PromptList(prompts=[], cached=False, source_models=[], degraded=False)`.
   - `florence_detect`, `grounding_dino_detect`: `[FrameDetections(detector=..., frame_id=f.frame_id, detections=[], detector_error=False) for f in frames]`.
   - `sahi_recovery`: `[]` (no triggered frames).
   - `effsam_segment`: `[]` masks.
   - `box_fusion`: `FusedFrame(frame_id, fused=[])` per frame.
   - `crop_embedding`: `EmbeddedFrame(frame_id, embeddings={})` per frame.
   - `cross_pass_dedup`: `DedupedFrame(frame_id, detections=[])` per frame.
   - `cross_frame_dedup`: `SceneObservation(detections=[], agreementCoverage=0.0, agreementPrecision=0.0, ...)`.
   - `classification_refine`: pass-through of input `SceneObservation`.
   - `agreement_scoring`: empty-detection-set semantics: `coverage=0.0, precision=0.0`. Stub does NOT set `flagged=True` for `empty_detection_set` — that requires checking `norm(scene_embedding) > ε`, which the stub can't do reliably; section 07 lands the real flag logic.
   - `self_diagnosis`: terminal branch only — yields `Out(SceneObservation)` directly. Signature includes `DynamicOut` declaration (no fan-out emitted in section 01).
3. Annotates Dagster asset metadata with `op_stubbed=True` so the eval-rig in section 09 can detect a partially-stubbed pipeline.
4. Does **not** call any model client. Asserted via mock in `test_passthrough_ops.py`.

### `pipeline_service/log_redaction.py` (real — §3.0, §8.3)

Structured-log filter for VLM outputs. Accepts log records with `extra={"_redact": True, ...}` and rewrites the message to structural-shape only:

- `len=N`
- `sample_first_3=[lowercased noun heads only]`

Full content is **not** in the formatted log line. Full content **is** preserved in Dagster asset metadata (kept on local Mac, not emitted to Loki).

Wire it into the FastAPI server's logger setup at startup (`api/server.py` lifespan). Default-on; `PIPELINE_LOG_REDACTION=false` env disables it for debug.

In section 01, the redaction infrastructure is in place but the only ops emitting `_redact=True` records won't exist until sections 04 and 03. The infrastructure is tested with synthetic log records.

### `pipeline_service/storage/retention.py` (real — §8.2)

Nightly Dagster `@schedule` that deletes run records older than the most-recent N (default 200, configurable). Implementation: query `DagsterInstance.get_runs()` ordered by `update_timestamp`, slice `[N:]`, call `instance.delete_run(run_id)`.

Cron: `0 3 * * *` (03:00 local — quietest time on a personal Mac).

Registered in `dagster_defs.py::Definitions(schedules=[prune_runs_schedule])`. The Dagster webserver and the sidecar both pick this up because they share `DAGSTER_HOME`.

### `pipeline_service/storage/{faiss_index,prompt_cache}.py`

Empty placeholders — class shells with method signatures only. Filled in sections 04 (prompt_cache) and 06 (faiss_index).

### `pipeline_service/models/*.py`

NO-OP class shells in this section. Each exports the class signature its real version will have, plus a no-op `warmup()` async method that the FastAPI lifespan calls. Specifically:

- `florence_client.FlorenceClient`: HTTP client shell; `warmup()` no-op (real impl in section 03 hits `detection-service/`'s health endpoint).
- `ollama_client.OllamaClient`: class with **`asyncio.Semaphore(1)` per model** held as a class-level dict `_semaphores: dict[str, asyncio.Semaphore]`. `warmup()` no-op. Real impl in section 03 will gate Ollama HTTP calls through the semaphore — so the data structure is in place even though there are no callers yet.
- `grounding_dino.GroundingDinoLoader`: shell; `warmup()` no-op.
- `effsam.EffSAMLoader`: shell; `warmup()` no-op.
- `dinov2.DinoV2Loader`: shell; `warmup()` no-op.
- `label_encoder.LabelEncoder`: shell; `warmup()` no-op.

The model-warmup test in section 01 only asserts that all six `warmup()` methods are awaited at startup and `/health` flips to `ready=true` after.

### `scripts/start-pipeline.sh` (NEW)

Bash script that:

1. `set -euo pipefail`.
2. Health-check Florence detection-service (`curl -fs http://localhost:14001/health || exit 1`).
3. Health-check Ollama (`curl -fs http://localhost:11434/api/tags || exit 1`).
4. Export `DAGSTER_HOME=~/allmythings-data/dagster`, ensure dir exists, `mkdir -p`.
5. `cd pipeline-service && uv run uvicorn pipeline_service.api.server:app --host 127.0.0.1 --port "${PIPELINE_PORT:-14100}"`.
6. Block until the sidecar's `/health` reports `ready=true` (poll once per second, timeout 60 s) — section 01 warm-up is no-op so this should be near-instant; sections 03+ slow it down.

The Makefile change to wire this into `make start` lives in section 10 (cleanup-cutover) — section 01 only adds the script.

### `pipeline_service/__init__.py` and `pipeline_service/api/__init__.py` etc.

Standard package init files. Empty is fine.

### `eval/thresholds.json` (placeholder for section 01)

Default thresholds that section 09 will tune:

```
{
  "agreement_coverage_min": 0.70,
  "dedup_precision_min": 0.88,
  "op_failure_rate_max": 0.05,
  "single_source_run_rate_max": 0.05,
  "empty_detection_set_rate_max": 0.02
}
```

Section 01 ships this file; section 09 wires the gating.

### `eval/run_eval.py` and `eval/metrics.py`

Placeholders only (importable, no real impl). Section 09 fills them in. Just make sure imports resolve so other parts of the test suite that touch `eval/` don't ImportError.

### `tests/conftest.py`

Pytest fixtures used across the test suite:

- `tmp_dagster_home`: `tmp_path` subdir set as `DAGSTER_HOME` for the test.
- `tmp_photo_dir`: `tmp_path` subdir set as `PIPELINE_PHOTO_DIR`.
- `fastapi_client`: `httpx.AsyncClient` against `pipeline_service.api.server:app` with the in-memory transport (no real port binding needed for unit tests).
- `mock_florence_http`, `mock_ollama_http`: `pytest-httpx` mock responders. In section 01, no test uses them (no real model calls), but the fixtures exist for sections 03+.

---

## Done checklist

This section is **done** when:

- [ ] `pipeline-service/pyproject.toml` + `uv.lock` exist, `uv sync` succeeds.
- [ ] Directory structure matches §2 of the plan (verified by `tests/test_repo_structure.py`).
- [ ] All Pydantic types from `types.py` are defined and round-trip-validate against the TS contract shapes from §5.1 (the round-trip integration test lives in section 02; section 01 only needs Pydantic validation against the JSON shapes).
- [ ] `frame_intake` is a real op with the §3.1 contract; all §3.1 unit tests pass.
- [ ] `assemble_result` is a real op with the §3.15 contract; all §3.15 unit tests pass.
- [ ] All 13 middle ops are typed pass-through stubs with empty-set semantics; the parametrised `test_passthrough_ops.py` passes.
- [ ] `dagster_defs.py` wires the full DAG; `Definitions` validates without error; `materialize()` runs end-to-end on a 3-frame fixture and produces a valid (empty) `SceneObservation`.
- [ ] `POST /runs` returns 202 with run_id; idempotent re-POST returns the same run_id. All §4.2 sidecar API tests pass.
- [ ] `GET /runs/:id/wait?timeout_s=N` long-polls the Dagster event stream and resolves on terminal state.
- [ ] `GET /runs/:id/timeline` returns per-op timing.
- [ ] 503 backpressure path: `max_queue_depth=4` + 5 concurrent runs → 5th request gets 503 with `queue_depth=4` and `retry_after_s` populated.
- [ ] Sidecar binds to `127.0.0.1` only (asserted by socket inspection test).
- [ ] FastAPI lifespan calls every `models/*.warmup()`; `/health` flips `ready: false → true` after.
- [ ] `log_redaction.py` is wired into the server bootstrap; the `_redact=True` flag rewrites log lines to `len + sample_first_3`; full content stays in Dagster asset metadata.
- [ ] Nightly retention schedule (`storage/retention.py::prune_runs`) is registered in `Definitions` and prunes runs > 200 in tests.
- [ ] `scripts/start-pipeline.sh` exists, health-checks Florence + Ollama, blocks on `/health` ready.
- [ ] `OllamaClient` exposes the per-model `asyncio.Semaphore(1)` data structure (no callers yet — section 03 will use it).
- [ ] All tests under `pipeline-service/tests/` pass: `cd pipeline-service && uv run pytest`.
- [ ] Replay-test infrastructure (`tests/replay/test_op_replay.py`) is in place with at least one fixture each for `frame_intake` and `assemble_result`.

---

## What this section does NOT do (deferred to other sections)

- **Fastify ↔ pipeline-service wiring** — section 02 (`pipeline.client.ts`, circuit-breaker integration, `USE_PIPELINE_SERVICE` flag, 503/Retry-After path).
- **Real `florence_detect` / `classification_refine`** — section 03.
- **Real `scene_embedding` / `vlm_prompt_expansion` / `crop_embedding`** with DINOv2 + Qwen + prompt-cache — section 04.
- **Apple-Silicon spike + `grounding_dino_detect` / `sahi_recovery` / `effsam_segment`** — section 05.
- **Real `box_fusion` / `cross_pass_dedup` / `cross_frame_dedup` / `label_text_compat`** — section 06.
- **Real `agreement_scoring` / `self_diagnosis` (DynamicOut fan-out, strictness ladder, no-improvement bail-out)** — section 07.
- **Mobile burst capture, on-device gating, face redaction, Drift v5** — section 08.
- **Eval rig (`run_eval.py`, `metrics.py`, corpus protocol, CI gating)** — section 09.
- **Temporal deletion, USE_PIPELINE_SERVICE removal, CLAUDE.md update** — section 10.