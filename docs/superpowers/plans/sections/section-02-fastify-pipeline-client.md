I have all the information I need to write section 02. Let me generate the content.

# section-02-fastify-pipeline-client

## Goal

Wire the Fastify TS edge to the new Python `pipeline-service` skeleton (built in section-01) via a new HTTP client wrapped by the existing `circuit-breaker.ts`. Introduce a feature flag `USE_PIPELINE_SERVICE` so `detect.route.ts` and `detect-status.route.ts` can switch between the legacy Temporal client and the new pipeline client without touching mobile. Add the 503/Retry-After backpressure path. Add the Phase-5 lint that fails CI if the flag lingers past acceptance. Mirror the Python contract types into a new `api-service/src/types/pipeline.ts`.

This section is **TS-only** (Fastify/Vitest). Mobile and Python sides are handled in sections 08 and 01/03 respectively.

## Dependencies

- **section-01-pipeline-skeleton** must be merged. This section assumes the sidecar serves:
  - `POST /runs` (returns 202 with `run_id`, or 200 with `idempotent_hit=true`, or 503 `queue_full`)
  - `GET /runs/:runId`
  - `GET /runs/:runId/wait?timeout_s=N` (long-poll)
  - `GET /runs/:runId/timeline`
  - request/response shapes per §4.2 in this document.

This section does **not** require sections 03+ — the sidecar may still return stub `SceneObservation`s; the client must round-trip the contract regardless of fill.

## Test command

```
cd api-service && npm test
```

(Polyglot repo: project-default `pytest` lives in `pipeline-service/`. This section's tests are Vitest.)

---

## Background — what the sidecar gives us (copy of §4.2 contract for self-containment)

The Fastify ↔ pipeline-service boundary is loopback HTTP, JSON. Sidecar binds to `127.0.0.1`. No inter-service auth in v1 (single-user Mac threat model).

### `POST /runs`

Request:
```
{
  idempotency_key: string,        // sha256 of concatenated frame hashes
  photo_paths:     string[],      // server-local paths; sidecar loads from these
  trace_id:        string,
  request_id:      string,
  config?:         PipelineConfig // optional override
}
```

Responses:
- `202 { run_id, started_at: ISO8601, idempotent_hit: false }`
- `200 { run_id, started_at, idempotent_hit: true, status: "running" | "succeeded", result?: SceneObservation }`
- `503 { error: "queue_full", queue_depth: int, retry_after_s: int }`

### `GET /runs/:runId`

```
200 {
  run_id,
  status: "running" | "succeeded" | "failed" | "cancelled" | "timed_out",
  started_at,
  finished_at?,
  result?: SceneObservation,
  error_code?: string,
  error_message?: string
}
```

### `GET /runs/:runId/wait?timeout_s=N`

Sidecar long-polls Dagster's instance event stream up to `N` seconds, returns the same shape as `GET /runs/:runId` once the run reaches a terminal state OR `timeout_s` elapses (whichever first). On timeout, returns the current (still-running) state — **not** a 5xx.

### `GET /runs/:runId/timeline`

```
200 {
  run_id,
  ops: [
    { name, status, started_at, duration_ms, retry_count, dynamic_outputs?: int }
  ]
}
```

### Idempotency rules

- Run already exists for `idempotency_key` in `running` → return existing `run_id, status="running", idempotent_hit=true`.
- Exists in `succeeded` with cached result → return result, `idempotent_hit=true`.
- Failed → allow a fresh run (preserves the existing Temporal `ALLOW_DUPLICATE_FAILED_ONLY` semantics).

### Backpressure

Sidecar tracks queue depth (in-process semaphore + pending). Configurable `max_queue_depth` (default 4). Above the limit, returns 503 with `retry_after_s` based on a moving average of run duration. The TS client surfaces this as a typed `QueueFullError`.

---

## Files to create / modify

### NEW

- `api-service/src/clients/pipeline.client.ts`
- `api-service/src/types/pipeline.ts` — TS mirror of the Python Pydantic types (§5.1 of the master plan; full type listing is below).
- `api-service/tests/unit/clients/pipeline.client.test.ts`
- `api-service/scripts/check-phase-gates.ts` — the Phase-5 lint (only the lint rules relevant to **this** section; section-10 will extend it).

### MODIFIED

- `api-service/src/routes/detect.route.ts` — switch on `USE_PIPELINE_SERVICE`; on, call `pipeline.client`. Off, call current Temporal client. Add 503/Retry-After path.
- `api-service/src/routes/detect-status.route.ts` — same flag-gated switch; uses `pipeline.client.getRun()` when on.
- `api-service/src/config/env.config.ts` — add `PIPELINE_URL` (default `http://127.0.0.1:14101`), `USE_PIPELINE_SERVICE` (boolean, default `false`), `PIPELINE_LONGPOLL_TIMEOUT_S` (default 25), `PIPELINE_MAX_RPS` (default 5). **Do not** drop `TEMPORAL_*` / `TIER_*` here — that's section-10.
- `api-service/src/utils/circuit-breaker.ts` — KEEP as-is; section just wires it around `pipeline.client`. No code change required to circuit-breaker itself.
- `api-service/tests/unit/routes/detect.route.test.ts` — extend with the new flag-on assertions (existing flag-off tests stay green).
- `api-service/tests/unit/routes/detect-status.route.test.ts` — extend likewise.
- `api-service/package.json` — only if a new dep is genuinely required (e.g., if `undici` isn't already present for HTTP). Check existing deps first; do not add if a working HTTP client is already imported elsewhere in `api-service`.
- `api-service/.eslintrc` (or equivalent) — add a project-config lint rule that flags `USE_PIPELINE_SERVICE` references; the rule is **disabled** until Phase 5. The actual gate is enforced by `scripts/check-phase-gates.ts`, not the linter.

---

## Tests FIRST

Write these BEFORE any client code.

### `api-service/tests/unit/clients/pipeline.client.test.ts`

```ts
// Imports and fixtures: a mocked HTTP transport (use the same mocking
// approach already established in the existing api-service test suite —
// MSW, nock, or vi.fn over fetch — match what's there). Do not import
// real network. Each test stubs the sidecar response.

// --- launchRun() ----------------------------------------------------------

// Test: launchRun POSTs { idempotency_key, photo_paths, trace_id, request_id }
//       to PIPELINE_URL + "/runs" with content-type application/json.
// Test: 202 response → resolves with { runId, startedAt, idempotentHit: false }.
// Test: 200 idempotent_hit=true with status="running" → resolves with
//       { runId, idempotentHit: true, status: 'running' } (no result yet).
// Test: 200 idempotent_hit=true with status="succeeded" → resolves with
//       { runId, idempotentHit: true, status: 'succeeded', result: SceneObservation }.
// Test: 503 with body { error: "queue_full", retry_after_s } → throws a typed
//       QueueFullError carrying retry_after_s. The route layer turns this
//       into a 503 + Retry-After to the mobile.

// --- getRun() -------------------------------------------------------------

// Test: getRun(runId) GETs /runs/:runId; returns the JSON as RunStatus.
// Test: 404 from sidecar → throws RunNotFoundError (route layer maps to 404).
// Test: 5xx from sidecar → throws PipelineUnavailableError (circuit-breaker
//       counts these).

// --- waitForCompletion() --------------------------------------------------

// Test: waitForCompletion calls GET /runs/:id/wait?timeout_s=N with N =
//       min(remaining_deadline_s, PIPELINE_LONGPOLL_TIMEOUT_S [default 25]).
// Test: long-poll returns terminal status before deadline → resolves immediately.
// Test: long-poll resolves with status="running" before deadline → loops back
//       into another /wait call with reduced N.
// Test: when GET /wait returns 404 (sidecar version without /wait, or runtime
//       degradation), client falls back to short-poll: 250ms initial,
//       exponential ×2, capped at 2s, capped at 5 RPS per run total.
// Test: total polling RPS over the lifetime of one waitForCompletion call
//       does not exceed PIPELINE_MAX_RPS (default 5/s). Verified by counting
//       calls under a fake timer.
// Test: deadlineMs reached while still running → resolves with the last
//       observed RunStatus (status='running'); does NOT throw.
// Test: deadline math: deadlineMs is wall-clock; the long-poll's timeout_s
//       is reduced as deadline approaches; never sends timeout_s ≤ 0.

// --- circuit-breaker integration -----------------------------------------

// Test: repeated 5xx from sidecar opens the circuit-breaker; subsequent
//       calls within the breaker's open window resolve fast with
//       PipelineUnavailableError without hitting the network.
// Test: circuit-breaker half-open probe succeeds once sidecar recovers;
//       client returns to normal operation.

// --- header forwarding ---------------------------------------------------

// Test: trace_id and request_id from the inbound Fastify request are
//       forwarded into the JSON body AND into a traceparent header on the
//       outbound HTTP call.
```

### `api-service/tests/unit/routes/detect.route.test.ts` (extensions)

```ts
// (existing flag-off tests stay; ADD these new ones for flag-on.)

// Test: with USE_PIPELINE_SERVICE=true, POST /v1/detect with 3 multipart
//       parts → calls pipeline.client.launchRun with photoPaths.length === 3.
// Test: idempotency_key sent to launchRun is sha256 of the concatenated
//       frame hashes (in submission order). Hash function is the existing
//       one; this just asserts wiring.
// Test: launchRun returns idempotentHit=true && status='succeeded' →
//       route returns 200 with the cached SceneObservation; never calls
//       waitForCompletion.
// Test: launchRun returns 202 (running) → route calls waitForCompletion
//       with deadline = httpResponseTimeoutMs - bufferMs.
// Test: waitForCompletion resolves with terminal succeeded → 200 result.
// Test: waitForCompletion resolves with status='running' (deadline hit) →
//       route returns 202 with { runId, statusUrl }.
// Test: launchRun throws QueueFullError → route returns 503 with
//       Retry-After: <retry_after_s>.
// Test: pipeline.client.* throws PipelineUnavailableError → route returns
//       503 (no Retry-After; circuit-breaker is open).
// Test: USE_PIPELINE_SERVICE=false → no pipeline.client calls at all;
//       legacy Temporal path runs unchanged. (Regression — flag isolation.)
```

### `api-service/tests/unit/routes/detect-status.route.test.ts` (extensions)

```ts
// Test: USE_PIPELINE_SERVICE=true → /v1/detect/status/:runId calls
//       pipeline.client.getRun(); returns SceneObservation on succeeded.
// Test: maps sidecar status → HTTP status:
//       running → 202; succeeded → 200; failed/cancelled/timed_out → 500;
//       RunNotFoundError → 404.
// Test: USE_PIPELINE_SERVICE=false → legacy Temporal status path runs.
```

### `api-service/scripts/check-phase-gates.ts` test (relevant slice for this section)

This section adds **only** the flag-related lint. Section-10 extends this script with deletion gates.

```ts
// Test: passes when USE_PIPELINE_SERVICE is referenced AND
//       api-service/src/temporal/ still exists (pre-Phase-5 state — OK).
// Test: passes when USE_PIPELINE_SERVICE is removed AND temporal/ is removed
//       (post-Phase-5 state — OK).
// Test: FAILS when USE_PIPELINE_SERVICE is removed AND temporal/ still exists
//       (signals incomplete Phase-5).
// Test: FAILS when USE_PIPELINE_SERVICE is referenced AND temporal/ has been
//       removed (the flag has lingered past acceptance — section-10 won't
//       have a fallback path).
```

The lint is **wired into CI** via `package.json`:

```json
"scripts": {
  "check-phase-gates": "tsx scripts/check-phase-gates.ts"
}
```

…and the existing CI workflow gains a step that runs `npm run check-phase-gates`. (Section-10 extends; this section just establishes the file and the flag-vs-temporal/ rule.)

---

## Implementation details — `pipeline.client.ts`

Single-file module. Stub-only contract here; bodies authored by the implementer:

```ts
// api-service/src/clients/pipeline.client.ts

import type {
  PipelineConfig,
  SceneObservation,
  RunStatus,
} from '../types/pipeline.js';

/** Thrown when sidecar returns 503 queue_full. Route layer maps to HTTP 503 + Retry-After. */
export class QueueFullError extends Error {
  retryAfterS: number;
  queueDepth: number;
  constructor(retryAfterS: number, queueDepth: number) { /* ... */ }
}

/** Thrown when sidecar returns 404 for a runId. Route layer maps to HTTP 404. */
export class RunNotFoundError extends Error { /* ... */ }

/** Thrown when sidecar is unreachable / 5xx / circuit-breaker open. Route layer maps to HTTP 503. */
export class PipelineUnavailableError extends Error { /* ... */ }

export interface LaunchRunArgs {
  idempotencyKey: string;       // sha256 of concatenated frame hashes
  photoPaths: string[];
  traceId: string;
  requestId: string;
  config?: Partial<PipelineConfig>;
}

export interface LaunchRunResult {
  runId: string;
  startedAt: string;
  idempotentHit: boolean;
  status?: 'running' | 'succeeded';
  result?: SceneObservation;     // only present if idempotentHit && status='succeeded'
}

export interface PipelineClient {
  /** POST /runs */
  launchRun(args: LaunchRunArgs): Promise<LaunchRunResult>;

  /** GET /runs/:id */
  getRun(runId: string): Promise<RunStatus>;

  /**
   * Long-poll wait for terminal state, with deadline.
   * - Uses GET /runs/:id/wait?timeout_s=N first.
   * - Falls back to short-poll (250 ms initial, ×2 exponential, capped at 2 s).
   * - Caps total RPS at PIPELINE_MAX_RPS (default 5/s/run).
   * - Returns the last observed RunStatus on deadline expiry; does NOT throw.
   */
  waitForCompletion(runId: string, deadlineMs: number): Promise<RunStatus>;
}

export function createPipelineClient(deps: {
  baseUrl: string;
  fetchImpl?: typeof fetch;          // injectable for tests
  longPollTimeoutS?: number;          // default 25
  maxRpsPerRun?: number;              // default 5
  circuitBreaker: CircuitBreaker;     // re-uses utils/circuit-breaker.ts
}): PipelineClient { /* ... */ }
```

### Behavioural notes (all must be enforced by tests above)

- **Long-poll math.** Each `/wait` call sends `timeout_s = min(remaining_deadline_s, longPollTimeoutS)`. If the response is non-terminal AND `remaining_deadline_s > 0`, loop. Never send `timeout_s ≤ 0`.
- **Short-poll fallback.** If `/wait` returns 404 (sidecar build doesn't have it) OR returns 5xx flagged by the breaker, switch to short-poll for the rest of this `waitForCompletion` call (don't keep re-trying `/wait` in a loop).
- **RPS cap.** A simple per-call rolling counter; when above `maxRpsPerRun`, sleep until the next slot opens. Tested under fake timers.
- **Header forwarding.** Outbound HTTP calls include `traceparent` (built from `traceId`) and a body containing `trace_id` + `request_id` so the sidecar can correlate.
- **Circuit-breaker.** Wrap each public method's HTTP work in `circuitBreaker.execute(...)`. The breaker is the existing `api-service/src/utils/circuit-breaker.ts` — do not reimplement.
- **Loopback only.** `baseUrl` must be `127.0.0.1`-bound (default `http://127.0.0.1:14101`); accept `localhost` as equivalent. No DNS, no TLS in v1.

---

## Implementation details — route changes

### `detect.route.ts` (flag-gated)

Pseudo-flow:

```
if (envConfig.USE_PIPELINE_SERVICE) {
  const idempotencyKey = sha256(concat(frame.sha256 for frame in frames));
  let launch;
  try {
    launch = await pipelineClient.launchRun({ idempotencyKey, photoPaths, traceId, requestId });
  } catch (e) {
    if (e instanceof QueueFullError) return reply.code(503).header('Retry-After', e.retryAfterS).send({ error: 'queue_full' });
    if (e instanceof PipelineUnavailableError) return reply.code(503).send({ error: 'pipeline_unavailable' });
    throw e;
  }

  if (launch.idempotentHit && launch.status === 'succeeded' && launch.result) {
    return reply.code(200).send(launch.result);  // SceneObservation
  }

  const deadlineMs = Date.now() + envConfig.HTTP_RESPONSE_TIMEOUT_MS - BUFFER_MS;
  const finalStatus = await pipelineClient.waitForCompletion(launch.runId, deadlineMs);

  if (finalStatus.status === 'succeeded' && finalStatus.result) {
    return reply.code(200).send(finalStatus.result);
  }
  if (finalStatus.status === 'running') {
    return reply.code(202).send({ runId: launch.runId, statusUrl: `/v1/detect/status/${launch.runId}` });
  }
  // failed | cancelled | timed_out
  return reply.code(500).send({ error: finalStatus.errorCode ?? 'pipeline_failed', message: finalStatus.errorMessage });
} else {
  // legacy Temporal path — unchanged
}
```

**Important:** the pre-existing legacy path stays unchanged. Don't refactor the Temporal call site in this section — section-10 deletes it. Keep both paths functionally identical from the mobile's perspective for the response shape (see "Translation layer" note below).

### Translation layer note

Section-08 (mobile) ships the move from `EnrichedItem` / `DetectResult` to `SceneObservation`. **During the window where Phase 6 (mobile) hasn't shipped yet but `USE_PIPELINE_SERVICE` is being tested in dev**, the new path returns `SceneObservation` while the legacy mobile expects `EnrichedItem`.

This section does **not** build the translator. The translator lives in `api-service/src/services/translation/` and is added in a later phase (between this section and section-08). What this section MUST do: reference the translation layer behind a second internal boolean (e.g., `LEGACY_RESPONSE_SHAPE`, default `false`) so when both flags conflict the path is well-defined. If `LEGACY_RESPONSE_SHAPE=true`, route calls `translationLayer.toEnrichedItem(sceneObservation)` before responding. The translation layer file does not need to exist yet — the route guards on the env var and on the absence of the import gracefully (e.g., dynamic import or feature-detect at startup, fail-fast if the env var is on but the file is missing).

### `detect-status.route.ts` (flag-gated)

```
if (envConfig.USE_PIPELINE_SERVICE) {
  let runStatus;
  try {
    runStatus = await pipelineClient.getRun(req.params.runId);
  } catch (e) {
    if (e instanceof RunNotFoundError) return reply.code(404).send();
    if (e instanceof PipelineUnavailableError) return reply.code(503).send();
    throw e;
  }
  switch (runStatus.status) {
    case 'running':                     return reply.code(202).send({ runId: runStatus.runId, status: 'running' });
    case 'succeeded':                   return reply.code(200).send(runStatus.result);
    case 'failed':
    case 'cancelled':
    case 'timed_out':                   return reply.code(500).send({ error: runStatus.errorCode, message: runStatus.errorMessage });
  }
} else {
  // legacy Temporal status path — unchanged
}
```

---

## `api-service/src/types/pipeline.ts` — TS mirror of the Python contract

Full type listing (mirror of §5.1; copy verbatim into the file):

```ts
export type FrameId     = string;
export type RunId       = string;
export type SceneId     = string;
export type DetectionId = string;

export interface PipelineConfig {
  thresholds: {
    detectionConfidenceMin:    number;
    sahiTriggerDensity:        number;
    crossPassEmbeddingTheta:   number;   // default 0.88
    crossFrameEmbeddingTheta:  number;   // default 0.85
    labelTextCompatTheta:      number;   // default 0.6
    agreementCoverageMin:      number;   // default 0.70
    agreementPrecisionMin:     number;   // default 0.40
    maxReruns:                 number;   // default 2
  };
  enabledDetectors: ('florence' | 'gdino' | 'gdino-sahi')[];
  classificationTierForcing?: 'qwen7b' | 'qwen3b' | 'moondream';
  boxFusion: {
    iouThr:           number;            // default 0.5
    skipBoxThr:       number;            // default 0.0
    detectorWeights:  { florence: number; gdino: number; 'gdino-sahi': number };
  };
}

export interface ContributingSignal {
  detector:       'florence' | 'gdino' | 'gdino-sahi';
  frameId:        FrameId;
  rawConfidence:  number | null;         // null for Florence (no score)
}

export interface TileError {
  tileIndex:  number;
  code:       string;
  message:    string;
}

export interface PipelineDetection {
  id:                       DetectionId;
  bbox:                     { x: number; y: number; width: number; height: number };
  maskRleB64?:              string;
  cropEmbeddingB64?:        string;       // int8 quantised, 768 B
  primaryLabel:             string;
  alternateLabels:          { label: string; confidence: number }[];
  vlmStructuredAttributes:  Record<string, unknown>;
  agreementScore:           number;
  contributingSignals:      ContributingSignal[];
  confidence:               number;       // sigmoid-calibrated
}

export interface SceneObservation {
  sceneId:                  SceneId;
  runId:                    RunId;
  frameIds:                 FrameId[];
  detections:               PipelineDetection[];
  agreementCoverage:        number;
  agreementPrecision:       number;
  selfDiagnosisTriggered:   boolean;
  rerunDepth:               number;
  flagged:                  boolean;
  flagReason?:              'empty_detection_set' | 'single_source_run'
                          | 'diagnosis_budget_exhausted' | 'assemble_failed' | string;
  processingMs:             number;
  errors:                   { op: string; code: string; message: string }[];
  tileErrors:               TileError[];   // aggregated across frames
}

export interface RunStatus {
  runId:        RunId;
  status:       'running' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out';
  startedAt:    string;
  finishedAt?:  string;
  result?:      SceneObservation;
  errorCode?:   string;
  errorMessage?: string;
}
```

Round-trip parity with the Python side is asserted by the integration test added in section-01 / extended in section-04 (`pipeline_contract.test.ts`); this section just publishes the file.

---

## `env.config.ts` additions

Add (do not remove anything yet):

```ts
PIPELINE_URL:               envSchema.string().default('http://127.0.0.1:14101'),
USE_PIPELINE_SERVICE:       envSchema.boolean().default(false),
PIPELINE_LONGPOLL_TIMEOUT_S: envSchema.number().default(25),
PIPELINE_MAX_RPS:           envSchema.number().default(5),
LEGACY_RESPONSE_SHAPE:      envSchema.boolean().default(false),  // see translation note above
```

---

## Phase-5 lint — `api-service/scripts/check-phase-gates.ts`

This section delivers the **flag/temporal coherence** check only:

```ts
// scripts/check-phase-gates.ts
//
// Enforces:
//   - USE_PIPELINE_SERVICE referenced  AND  src/temporal/ exists       → OK (pre-Phase-5)
//   - USE_PIPELINE_SERVICE removed    AND  src/temporal/ missing      → OK (post-Phase-5)
//   - USE_PIPELINE_SERVICE removed    AND  src/temporal/ exists       → FAIL
//   - USE_PIPELINE_SERVICE referenced AND  src/temporal/ missing      → FAIL
//
// Section-10 will extend this with translation/, schemas/detection.schema.ts,
// services/image-quality.service.ts, TEMPORAL_*/TIER_* env-var deletion gates,
// and the explicit "circuit-breaker.ts MUST exist" check.
```

Wire `npm run check-phase-gates` into the existing CI pipeline (e.g., `.github/workflows/*.yml` step or the existing `make lint` chain). Do **not** make it a default `npm test` dependency; it's a gate, not a unit test.

---

## Acceptance / "done" checklist

- [ ] `api-service/src/types/pipeline.ts` published with the full type set above; compiles under strict TS.
- [ ] `api-service/src/clients/pipeline.client.ts` created with `launchRun`, `getRun`, `waitForCompletion`; wrapped by `circuit-breaker.ts`.
- [ ] `pipeline.client.test.ts` covers all bullets above, all green.
- [ ] `detect.route.ts` flag-gated path: 200 / 202 / 503 / Retry-After all exercised by route tests.
- [ ] `detect-status.route.ts` flag-gated path: 200 / 202 / 500 / 404 / 503 all exercised.
- [ ] `env.config.ts` adds `PIPELINE_URL`, `USE_PIPELINE_SERVICE`, `PIPELINE_LONGPOLL_TIMEOUT_S`, `PIPELINE_MAX_RPS`, `LEGACY_RESPONSE_SHAPE`. No deletions.
- [ ] `circuit-breaker.ts` is unchanged but verifiably wired in (test asserts breaker integration).
- [ ] `scripts/check-phase-gates.ts` exists, has its own unit tests, and is invoked by `npm run check-phase-gates`. Currently passes (we're pre-Phase-5).
- [ ] `cd api-service && npm test` — green.
- [ ] `cd api-service && npm run lint` — green.
- [ ] `cd api-service && npm run type-check` — green.
- [ ] Existing flag-off tests (legacy Temporal path) **still pass** unchanged. This section does not alter legacy behaviour.
- [ ] No new runtime deps added unless `package.json` is updated and the dep is justified (prefer the existing HTTP stack).

---

## Out of scope for this section

- Building the Python sidecar (section-01).
- Building the translation layer file under `services/translation/` (later phase between this and section-08).
- Mobile changes — Mobile still talks to Fastify, unchanged shape until section-08 ships.
- Deleting `temporal/`, `providers/`, `schemas/detection.schema.ts`, etc. — that's section-10.
- Extending `check-phase-gates.ts` with deletion gates — that's section-10.
- Real-model integration — every test here mocks the sidecar HTTP layer.