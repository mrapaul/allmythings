# Production-Grade Temporal Orchestration — Design

**Date:** 2026-04-21
**Status:** Proposed — awaiting user review
**Supersedes:** parts of `2026-04-16-working-vertical-slice-design.md` (PipelineExecutor, in-app circuit breakers, custom trace viewer). Preserves Florence-2 + Qwen detection strategy.
**Related current branch:** `feature/plan-a-scaffolding-fast-pass`

## Problem Statement

The app is not reliably working end-to-end, manual testing is cumbersome because every try finds a different failure, and the orchestration and observability are not at production-grade. Symptom cluster observed:

- iPhone-to-Mac networking flakiness (b)
- Detection returns wrong or zero results (c)
- Detection hangs or takes forever (d)
- Services crash mid-flow under memory pressure (e)
- No visibility into why any given request failed (f)

Evidence collected from current repo state (2026-04-21):

- Host memory at **99.5%** with load average 19.97 — system resource-starved. Driven mostly by unrelated DeepSeek-R1 32B models camping in Ollama cache (19GB each), not the pipeline itself.
- **3 of 98 tests failing** in api-service — integration tests still assert old SSE streaming + `fused` response shape; `/v1/detect` was simplified to synchronous JSON weeks ago.
- **13 scratch JSON/log files** in repo root (`result.json`, `final_*.json`, `verify_result.json`, `detection_result.json`, `automated_result.json`, etc.) — evidence of repeated ad-hoc `curl | tee file.json` manual testing cycles with no structured replay.
- **6 detection log files** in `detection-service/` (`detection_crash.log`, `detection_final.log`, `detection_final_verify.log`, etc.) — same ad-hoc pattern on the Python side.
- Health route hardcoded to check a `gemini` provider that no longer exists; works by accident via `anyProviderStatus` fallback.
- `observability/docker-compose.observability.yml` and `docker-compose.hyperdx.yml` exist but neither is part of `make start` — all observability is opt-in and disconnected from the main loop.
- Legacy providers (`gemini.classifier.ts`, `claude.classifier.ts`, `google-vision.detector.ts`, `owlv2.detector.ts`, `grounding-dino.detector.ts`, `multi-pass-vlm.classifier.ts`) and legacy services (`detection-pipeline.service.ts`, `hybrid-pipeline.service.ts`, `ensemble-fusion.service.ts`) still present — unused by the active Florence pipeline but still tested, source of brittle failures.
- detection-service `main.py` eagerly loads the MLX/YOLO backend at startup for a `/detect/fast` route the active pipeline never hits — pure memory cost.

## Target Environment & Constraints (decided)

- **Host**: Mac M4 Pro, 48GB unified memory, macOS 26.5, 14 cores (10P + 4E)
- **Scope**: hybrid — local Mac dev loop, backend architected like a deployable service (stateless, observable, replayable)
- **Models**: open-source only, weights must be Apache 2.0 or MIT
- **Hosting**: fully local for now; architecture must allow a config-only switch to self-hosted GPU or hosted-OSS (Fireworks/Together) later — no code rewrite
- **Cost today**: $0/month
- **Observability**: production-grade from day one (traces, metrics, logs, SLOs, dashboards) — not opt-in

## Approach

**Replace the homegrown orchestration layer with Temporal.** The symptoms above cluster around durable execution, retries, timeouts, queueing, idempotency, and trace-level observability — exactly Temporal's problem domain. Keeping Florence-2 + Qwen2.5-VL (local Ollama) as the model stack; discarding legacy providers and legacy pipeline services.

### Why Temporal specifically

| Candidate | Rejected because |
|---|---|
| Homegrown PipelineExecutor (current) | Yak-shaving retries, breakers, idempotency, replay, UI ourselves — all already broken or missing |
| BullMQ | Queues well, weak at workflow durability + observability, no replay |
| Inngest | Nice DX but cloud-first; thinner self-hosted story |
| Restate | Promising, but insufficiently battle-tested for our purposes |
| Prefect/Airflow | Batch-data-pipeline shaped; awkward for synchronous request/response |

**Temporal wins**: Apache 2.0 server, production-proven (Stripe, Coinbase, DoorDash), first-class TypeScript SDK, self-hostable (SQLite or Postgres backend, ~150MB RAM for dev server), clean migration to Temporal Cloud with zero code change, best-in-class workflow UI.

### Tradeoffs accepted

- +1 local process (`temporal server start-dev`, ~150MB RAM, SQLite) — trivial on 48GB
- Workflow code must be deterministic — no `Math.random`, no `Date.now()` in workflows (only in activities); takes ~1 day to internalize
- `@temporalio/testing` replaces ad-hoc integration harness — new framework to learn but better than what we had

## Section 1 — Target Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  iPhone (Flutter)                                              │
│  ┌─ Camera + on-device quality gate (<100ms)                   │
│  ├─ Trace ID generated at shutter tap                          │
│  └─ POST /v1/detect  (image + W3C traceparent header)          │
└─────────────────────────┬─────────────────────────────────────┘
                          ▼
┌───────────────────────────────────────────────────────────────┐
│  api-service (Fastify :14000) — thin HTTP surface              │
│  ┌─ workflowId = sha256(image bytes)                           │
│  ├─ temporalClient.start(detectInventoryWorkflow, …)           │
│  └─ await workflow result → HTTP response                      │
└─────────────────────────┬─────────────────────────────────────┘
                          │ gRPC
                          ▼
┌───────────────────────────────────────────────────────────────┐
│  Temporal Server (:7233 gRPC, :8233 Web UI)                    │
│  Durable workflow state (SQLite), task queues, replay          │
└─────────────────────────┬─────────────────────────────────────┘
                          │ task polling
                          ▼
┌───────────────────────────────────────────────────────────────┐
│  api-service Worker (in-process with Fastify)                  │
│  task queue: "inventory-pipeline"                              │
│  maxConcurrentActivityTaskExecutions: 1                        │
│                                                                │
│  Workflow: detectInventoryWorkflow                             │
│    1. savePhoto          (5s SToC, no retry)                   │
│    2. florenceDetect     (30s SToC, 2 retries, 1s/3s backoff)  │
│    3. enrichItems        (45s budget, tier chain)              │
│    4. assembleResult     (2s SToC, no retry)                   │
│                                                                │
│  Activities call: detection-service HTTP, Ollama HTTP, FS      │
└─────┬──────────────────────────┬──────────────────────────────┘
      ▼                          ▼
┌──────────────────┐    ┌──────────────────────────────────┐
│ detection-service│    │  Ollama (:11434)                 │
│ Python :14001    │    │                                   │
│ ┌─ Florence-2 Lrg│    │  Tier 1: qwen2.5vl:7b (~6GB)    │
│ │   (MPS, MIT)   │    │  Tier 2: qwen2.5vl:3b (~3GB)    │
│ ├─ NO MLX eager  │    │  Tier 3: moondream    (~1.7GB)  │
│ │   YOLO load    │    │  Tier 4: no model — Florence    │
│ └─ /metrics      │    │          caption as label only  │
└──────────────────┘    └──────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│  Observability (part of `make start`)                          │
│  Temporal UI        ← workflow runs, activity waterfalls       │
│  OTel Collector     → Tempo (traces linked to workflows)       │
│  Loki               ← pino + structlog (logs)                  │
│  Prometheus         ← /metrics on api + detection + temporal   │
│  Grafana            → pre-provisioned dashboards               │
│  Alertmanager       → macOS desktop notifications              │
└───────────────────────────────────────────────────────────────┘
```

### Service boundaries

- **detection-service** — Florence-2 inference only. Stateless. Called as an HTTP service by a Temporal activity. Not made a Temporal worker itself — complexity not worth the win.
- **api-service** — Fastify HTTP surface + in-process Temporal worker. Owns photo storage, HTTP, health, metrics, workflow orchestration.
- **Ollama** — VLM inference. Unchanged.
- **mobile app** — UI, on-device gating, local Drift SQLite, retry with exponential backoff on 429/503.

### Code/infra cuts on day one

- `api-service/src/providers/gemini.classifier.ts`
- `api-service/src/providers/claude.classifier.ts`
- `api-service/src/providers/google-vision.detector.ts`
- `api-service/src/providers/owlv2.detector.ts`
- `api-service/src/providers/grounding-dino.detector.ts`
- `api-service/src/services/detection-pipeline.service.ts`
- `api-service/src/services/hybrid-pipeline.service.ts`
- `api-service/src/services/ensemble-fusion.service.ts`
- `api-service/src/services/multi-pass-vlm.classifier.ts`
- `api-service/src/services/pipeline-executor.ts` (replaced by Temporal workflow)
- All tests for the above
- MLX/YOLO eager load block in `detection-service/src/detection_service/main.py`
- All 13 scratch JSON files in repo root
- All 6 `detection*.log` files in `detection-service/`
- Legacy `/detect/fast` route in detection-service if unused by any active path
- Hardcoded `'gemini'` check in `api-service/src/routes/health.route.ts`

## Section 2 — Pipeline Discipline (Temporal-native)

### 2.1 Request queue with backpressure

Implemented via Temporal task queue + worker concurrency:

```
Task queue: "inventory-pipeline"
Worker option: maxConcurrentActivityTaskExecutions = 1  (configurable: PIPELINE_MAX_CONCURRENCY)
```

Temporal queues workflow starts natively up to its internal limits (millions). We limit *activity* concurrency so only one Florence + one Qwen runs at a time on the Mac.

HTTP-level behaviour in Fastify (awaiting workflow result):
- Fastify awaits `temporalClient.workflow.result()` up to `HTTP_RESPONSE_TIMEOUT_MS` (default **90s**, strictly less than the workflow timeout so the workflow keeps running if HTTP gives up). If the HTTP timeout fires first, respond `202 Accepted` with `{ workflowId, statusUrl }` and let the client poll `GET /v1/detect/status/:workflowId`. Mobile app defaults to synchronous wait; falls back to polling on 202.
- If queue depth gauge exceeds `QUEUE_BACKPRESSURE_THRESHOLD`, return `429 Too Many Requests` with `Retry-After` header.

### 2.2 Per-provider circuit breakers via activity retry + non-retryable errors

```
Florence activity retry policy:
  maximumAttempts: 3
  initialInterval: 1s
  backoffCoefficient: 3.0
  nonRetryableErrorTypes: ['BadInputError', 'UnsupportedMediaType']

Ollama per-tier activity retry policy:
  maximumAttempts: 2
  initialInterval: 2s
  nonRetryableErrorTypes: ['ModelNotFoundError', 'BadPromptError']
```

Circuit-breaker-like behaviour is composed from:
1. Activity retries exhaust → activity fails
2. Workflow catches and tries next tier (2.3)
3. A separate `ProviderHealthService` (non-workflow) tracks rolling failure rates outside Temporal for the `/v1/health` endpoint and Grafana dashboards. Temporal doesn't need this state — the workflow falls through tiers on raw failure.

### 2.3 Enrichment tier chain

Workflow logic (pseudocode — not literal TypeScript; budget tracking uses Temporal-safe primitives in the real impl):

```typescript
// Temporal's workflow.time() is deterministic and replay-safe; use it (not Date.now())
async function enrichItems(input): Promise<EnrichedItem[]> {
  const tiers: TierConfig[] = [
    { name: 'qwen7b',        provider: 'ollama',        model: env.TIER_1_MODEL, timeout: '20 seconds' },
    { name: 'qwen3b',        provider: 'ollama',        model: env.TIER_2_MODEL, timeout: '12 seconds' },
    { name: 'moondream',     provider: 'ollama',        model: env.TIER_3_MODEL, timeout: '8 seconds'  },
    { name: 'florence-only', provider: 'florence-only', model: null,             timeout: '0 seconds'  },
  ];

  const deadline = workflow.time() + Duration.of('45 seconds').toMillis();
  const results: EnrichedItem[] = [];

  for (const item of input.items) {
    let enriched: EnrichedItem | null = null;
    for (const tier of tiers) {
      const timeRemaining = deadline - workflow.time();
      if (timeRemaining <= 0 && tier.name !== 'florence-only') continue;

      if (tier.name === 'florence-only') {
        enriched = florenceOnlyItem(item); // no activity call
        break;
      }
      try {
        enriched = await enrichWithTier(item, tier); // activity with its own retry policy
        break;
      } catch (err) {
        if (ApplicationFailure.isNonRetryable(err)) continue; // try next tier
        throw err; // unexpected deterministic error — fail loud
      }
    }
    results.push(enriched!);
  }
  return results;
}
```

Each item records the tier that served it (`item.enrichmentTier`), enabling tier-rate metrics.

### 2.4 Timeouts

| Activity | StartToCloseTimeout | ScheduleToCloseTimeout | Heartbeat |
|---|---|---|---|
| `savePhoto` | 5s | 10s | none |
| `florenceDetect` | 30s | 90s (across retries) | 10s |
| `enrichItemTier1` (qwen7b) | 20s/item | 45s enrichment budget | 5s |
| `enrichItemTier2` (qwen3b) | 12s/item | — | 5s |
| `enrichItemTier3` (moondream) | 8s/item | — | 5s |
| `assembleResult` | 2s | 5s | none |
| **Workflow overall** | — | `workflowExecutionTimeout: 120s` | — |

Heartbeats mean if a worker dies mid-inference, Temporal detects it within 10s (florence) or 5s (enrichment) and reschedules the activity on another worker.

### 2.5 Idempotency

```
workflowId = 'detect-' + sha256(imageBytes).hex()
WorkflowIdReusePolicy: ALLOW_DUPLICATE_FAILED_ONLY
```

Same image within the Temporal retention window (~24h for dev, configurable) returns the existing workflow result — no duplicate inference, same trace_id, same photo_id. Mobile client retries over flaky WiFi are idempotent without extra cache infra.

### 2.6 Model lifecycle

- **Florence-2**: lazy-loaded in detection-service on first `/detect/florence` call, stays resident (1.5GB is cheap). No unload.
- **Ollama models**: Ollama manages lifecycle; default 5-minute idle unload is fine. We don't override.
- **Warm-up** (see §5.2 Stage 6): `make start` fires one synthetic request through Tier 1 after all health gates pass, so the first real user request doesn't pay the cold-load cost.

## Section 3 — Observability

### 3.1 Two surfaces, one story

- **Temporal Web UI (`:8233`)** — primary surface for workflow/activity debugging. Every run, full inputs/outputs, replayable history, retry attempts, signals, queries.
- **Grafana (`:3000`)** — primary surface for infra metrics, logs, unified traces, SLO dashboards, alerts.

Both link on trace_id. Debug flow: iPhone error screen shows trace `abc123` → Grafana log query `{service=~".*"} |= "abc123"` → Tempo trace view → Temporal UI for that specific workflow.

### 3.2 OTel propagation

iPhone generates `traceparent` at shutter tap → Fastify → Temporal client records it as workflow attribute → worker propagates into activity OTel spans → activities wrap HTTP calls to detection-service and Ollama with `traceparent` headers → detection-service Python OTel picks it up → Ollama spans are synthesized by the activity wrapper (Ollama itself doesn't emit OTel).

Every span carries: `trace_id`, `span_id`, `workflow_id`, `activity_id`, `attempt`, `image.sha256`, `photo_id`, `tier`.

### 3.3 Metrics (Prometheus, 15s scrape)

**api-service `/metrics`**:

```
# Request-level
http_request_duration_ms_bucket{route,status}
http_requests_total{route,status}

# Workflow outcomes
workflow_duration_ms_bucket{workflow,status}
workflow_started_total{workflow}
workflow_completed_total{workflow,status="completed|failed|terminated|canceled"}

# Activity-level
activity_duration_ms_bucket{activity,status,attempt}
activity_retries_total{activity}
activity_nonretryable_failures_total{activity}

# Enrichment tiers
enrichment_tier_used_total{tier}
enrichment_tier_downgrades_total{from_tier,to_tier,reason}

# Provider probing (outside workflow)
provider_up{provider="florence|ollama|temporal"}
provider_probe_duration_ms{provider}

# Queue
temporal_task_queue_backlog{queue}    # from Temporal metrics
queue_rejections_total{reason="too_many_pending|budget_exceeded"}

# Idempotency
workflow_idempotent_reuse_total

# Process
process_resident_memory_bytes
nodejs_heap_size_used_bytes
```

**detection-service `/metrics`**:

```
florence_inference_ms_bucket
florence_regions_detected_bucket
florence_model_loaded             # gauge 0/1
http_request_duration_ms_bucket{route}
python_memory_rss_bytes
```

**Temporal server** — native Prometheus metrics at `:9090` (workflow task latency, persistence latency, sticky cache hit rate).

### 3.4 Structured logs

Pino (Node) and structlog (Python), JSON on stdout, Promtail → Loki. Every line carries `trace_id`, `span_id`, `workflow_id`, `activity_id`, `attempt`, `service`, `version`, `level`, `msg` plus context.

### 3.5 Dashboards (version-controlled, pre-provisioned)

1. **Pipeline Health** — rps, workflow success rate, p50/p95/p99 end-to-end, per-step duration, tier distribution
2. **Model Performance** — Florence inference histogram, regions-per-photo, Ollama per-item latency by model, tier-downgrade rate & reason
3. **Resources** — memory (host + each process), Ollama cache occupancy, disk usage of `~/allmythings-data/`, Temporal SQLite size
4. **Errors & Failures** — workflow failure rate by cause, activity failure rate by activity, non-retryable error classes
5. **Temporal Internals** — task queue backlog, sticky cache hit rate, workflow state store latency, worker poll latencies

Stored as JSON under `observability/grafana/dashboards/`, reprovisioned on container start.

### 3.6 SLIs / SLOs (CI-gated)

| SLI | Target | Window | Enforced in |
|---|---|---|---|
| Workflow success rate (completed, any tier) | ≥ 99% | rolling 100 runs | `make smoke` rolling SLO gate |
| End-to-end p95 latency | ≤ 25s | rolling 50 runs | smoke gate |
| End-to-end p99 latency | ≤ 45s | rolling 50 runs | smoke gate |
| Tier-1 enrichment rate | ≥ 80% | daily | eval harness gate |
| Activity non-retryable failure rate | ≤ 1% | rolling 100 runs | smoke gate |
| Provider probe uptime (florence, ollama) | ≥ 99.5% | rolling 1h | dashboard warning |
| Temporal server up | 100% | always | blocking dependency |

### 3.7 Alerting

Alertmanager → macOS desktop notification via webhook (`terminal-notifier` or `osascript`). Rules:

- Florence/Ollama provider DOWN > 30s → warning
- Workflow p95 > 30s over 10 runs → SLO warning
- Host memory > 85% sustained 60s → warning; > 95% → critical
- Temporal queue backlog > 10 for > 30s → warning
- Activity non-retryable failure > 5 in 5min → critical (code bug)

Future tiers: same rules, different delivery (Slack/Discord/PagerDuty).

## Section 4 — Testing

### 4.1 Five test layers

| Layer | What it exercises | Runtime | Where it runs |
|---|---|---|---|
| Unit | activities in isolation, adapters, pure functions | <5s total | every save, CI |
| Workflow | workflow logic via `@temporalio/testing` in-memory server + time skipping | <30s total | every save, CI |
| Integration | real Temporal dev server + real detection-service + mocked Ollama | <60s | every push, CI |
| Smoke | full stack, real fixture photo, real services, assertions against SLOs | ~60s | pre-commit, `make verify` |
| Accuracy | full stack, labeled fixture set, recall/precision | ~5min | nightly, pre-release |

### 4.2 Workflow tests (new — Temporal test framework)

```typescript
describe('detectInventoryWorkflow', () => {
  // completes all 4 steps when everything succeeds
  // downgrades to qwen3b when qwen7b times out repeatedly
  // downgrades to florence-only when all enrichment tiers fail
  // returns existing workflow result when same workflowId submitted twice
  // forces tier-3 fallback when enrichment budget exceeded
  // fails whole request when photo save fails (tested: filesystem error)
  // workflow is deterministic — replay against recorded history passes
});
```

The **replay test** checks in a recorded workflow history from a real run; the test replays it against current workflow code. Non-deterministic regressions (adding `Math.random`, reordering awaits in ways that change history) fail the test before they ship.

### 4.3 Integration tests

Spins up real Temporal dev server (in-process, SQLite, ~2s startup) + real detection-service (real Florence on CPU for CI) + mocked Ollama HTTP server. Asserts:

- Workflow starts, completes, result matches `DetectResult` schema
- Photo saved to tmp dir
- OTel spans emitted (in-memory SpanProcessor captures them)
- Metrics incremented (in-memory registry)
- Logs contain trace_id
- Breaker/fallback transitions correctly under induced failures

### 4.4 `make smoke` — replaces the 13 scratch JSON files

One command, one source of truth. Output structure shown in design session Section 4.4.

Script lives at `scripts/smoke.sh` + `scripts/smoke-assertions.ts`. Results cached to `~/allmythings-data/smoke-runs/` FIFO-100. Never writes to repo root.

Assertion categories:
- Happy path (real fixture image, response shape, SLOs)
- Trace correlation (trace_id present in Temporal UI API, Tempo, Loki, metrics)
- Idempotency (same image twice → cached result)
- Degraded path (Ollama stopped → tier-4 florence-only fallback)
- Fault injection (`kill -9` worker mid-workflow → resumes on restart, no data loss)
- Rolling SLO gate over last 100 smoke runs

### 4.5 Accuracy harness updates

Existing `eval/harness.mjs` retained. Adds:
- `florence:qwen7b` (primary — through Temporal workflow) — already partially done
- `florence:qwen3b`, `florence:moondream`, `florence:only` — tier-downgrade accuracy floors
- New metric: enrichment completeness (% of items with non-null color/material/condition)
- `make eval-ci` gate: tier-1 recall ≥ 77% (current baseline); overall recall ≥ 75%

### 4.6 CI pipeline

```
on: push, pull_request
jobs:
  unit:        npm test + pytest + flutter test            ~1min
  workflow:    Temporal test framework replay tests         ~30s
  integration: service integration suite                    ~1min
  smoke:       full smoke (self-hosted runner w/ Ollama)    ~1min
  accuracy:    make eval-ci (self-hosted, nightly)          ~5min
  slo-gate:    last-100 smoke SLO assertion                 ~5s
```

Smoke and accuracy require Ollama and so need a self-hosted Mac runner (or a nightly job); everything else runs on GitHub Actions.

### 4.7 Cleanup commitments (day 1)

- Delete the 13 scratch files currently in repo root: `result.json`, `final_attempt.json`, `final_final.json`, `final_result.json`, `final_success.json`, `final_test.json`, `final_verification.json`, `verify_result.json`, `detection_result.json`, `automated_result.json`, `all_detections.log`, `api_latest.log`, plus any others matching `*_result.json` / `final_*.json` patterns
- Delete 6 detection logs: `detection-service/detection*.log`
- Rewrite or delete `api-service/src/__tests__/integration/detect.route.test.ts` (currently asserts obsolete SSE + `fused` shape)
- `.gitignore`: add `/*.json` at repo root (except `package.json`, `package-lock.json`, `tsconfig.json`), `*.log` globally, `/tmp/allmythings/`, `~/allmythings-data/` is outside the repo so no entry needed

## Section 5 — Operations

### 5.1 Two modes

- **`make start`** — production-like. Docker-compose + native processes, pinned versions, no hot reload. `make smoke` runs against this. **SLOs measured against this mode.**
- **`make dev`** — hot-reload mode for api-service and detection-service; all other deps identical. Slower cold boot, faster edit loop.

Both share `make start-deps` for Temporal + Ollama + observability.

### 5.2 `make start` boot sequence (sequential, health-gated)

```
Stage 0: Preflight (< 3s)
  ✓ macOS ≥ 14.0, Docker running, Ollama installed, Node 20+, Python 3.12+
  ✓ Memory headroom ≥ 20GB free (warn if lower; stop if < 10GB)
  ✓ Disk headroom ≥ 10GB in ~/allmythings-data/

Stage 1: Observability stack (< 15s)
  docker compose up -d   (5 containers: otel-collector, tempo, loki, prometheus, grafana, alertmanager)
  Gates: Grafana /api/health, Loki /ready, Tempo /ready, Prometheus /-/ready

Stage 2: Temporal server (< 10s)
  temporal server start-dev --db-filename ~/allmythings-data/temporal.db --metrics-port 7243
  Gate: `temporal workflow list --address localhost:7233` succeeds

Stage 3: Ollama + model availability (< 30s, or longer if pulling)
  Gate: ollama list contains qwen2.5vl:7b, qwen2.5vl:3b, moondream (auto-pull if missing with progress)
  Warn: if any model > 10GB is currently loaded (e.g. deepseek-r1:32b) — explain memory impact, offer `ollama stop` prompt

Stage 4: detection-service (< 5s; first run Florence download is lazy, not blocking)
  uvicorn in background, PID in /tmp/allmythings/
  Logs → /tmp/allmythings/detection.log + Loki via Promtail
  Gate: GET /health returns 200 (model status "unloaded" is OK here)

Stage 5: api-service + Temporal worker (< 10s)
  Fastify + in-process Temporal worker polling "inventory-pipeline"
  Gate: /v1/health returns status="ready" (Temporal reachable, detection reachable, ollama reachable)
  Gate: Temporal sees worker poller

Stage 6: Warm-up (< 60s first run, < 10s after)
  POST /v1/detect with test_images/smoke_tiny.jpg
  Gate: workflow completes, ≥1 item returned
  Effect: Florence loaded in detection-service, Qwen loaded in Ollama
  Emit: system.ready event

► Ready.
  Temporal  http://localhost:8233
  Grafana   http://localhost:3000  (admin/admin — change on first login)
  API       http://localhost:14000

► iPhone connects via mDNS: allmythings._http._tcp.local

► Run `make smoke` to verify full pipeline.
```

### 5.3 Process supervision

- Docker-compose services: restart `unless-stopped`
- Native processes (api, detection) during `make start`: backgrounded children with PID files in `/tmp/allmythings/`; `make stop` cleans up
- Optional launchd supervisor (`make install-supervisor`): `com.allmythings.api.plist`, `com.allmythings.detection.plist` with `KeepAlive: true`, `RunAtLoad: false`. Opt-in. For "treat my Mac like a server."
- Ollama: already a launchd service, we just check it's running

### 5.4 Configuration

`.env.example` committed, documented. `.env` gitignored, optional (every var has a default).

**No secrets for Tier 0.** Hosted tier later introduces exactly one (`TIER_1_API_KEY` for Fireworks/Together if used).

Notable env vars (defaults shown):

```
API_PORT=14000
DETECTION_PORT=14001
TEMPORAL_HOST=localhost:7233
OLLAMA_URL=http://localhost:11434

FLORENCE_MODEL=microsoft/Florence-2-large
TIER_1_MODEL=qwen2.5vl:7b
TIER_2_MODEL=qwen2.5vl:3b
TIER_3_MODEL=moondream

PIPELINE_MAX_CONCURRENCY=1
ENRICHMENT_BUDGET_MS=45000
WORKFLOW_EXECUTION_TIMEOUT_MS=120000
HTTP_RESPONSE_TIMEOUT_MS=90000          # must be < WORKFLOW_EXECUTION_TIMEOUT_MS
QUEUE_BACKPRESSURE_THRESHOLD=10         # task queue backlog beyond which API returns 429

PHOTO_DIR=~/allmythings-data/photos
TEMPORAL_DB_FILE=~/allmythings-data/temporal.db

OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
LOG_LEVEL=info
```

### 5.5 Data lifecycle

```
~/allmythings-data/
  photos/
    {uuid}.jpg
    {uuid}_thumb.jpg
  temporal.db            ← Temporal SQLite workflow history
  smoke-runs/            ← last 100 smoke results, FIFO
```

- Photos: retained; prune policy deferred
- `temporal.db`: grows with workflow history. `temporal env cleanup` weekly cron archives completed workflows older than 30 days
- `smoke-runs`: FIFO-100, auto-pruned by script

`make backup` tars `~/allmythings-data/` to `~/allmythings-backups/YYYY-MM-DD.tar.gz`. `make restore FILE=...` untars and runs `make start`.

### 5.6 Failure runbook

| Failure | Detection | Automatic response | Human action |
|---|---|---|---|
| Ollama dies mid-workflow | heartbeat timeout (5s) | retry on restart; tier-downgrade chain engages | check `ollama ps`; supervisor restarts if installed |
| Ollama OOM on model load | activity returns `OllamaOutOfMemoryError` (non-retryable for that tier) | workflow falls to next tier | investigate what model is hogging RAM; `ollama stop <n>` |
| detection-service dies | `/health` probe fails; `florence` marked DOWN on /v1/health | workflow fails fast with clear error; iPhone shows actionable message | `make logs detection`; supervisor restarts |
| api-service worker dies mid-workflow | Temporal heartbeat timeout (10s) | workflow resumes on restarted worker; zero data loss | if restart loop: `make logs api` |
| Temporal server dies | `/v1/health` returns 503 (temporal: down); API 503s new requests | SQLite on disk — no data loss; restart recovers | `temporal server start-dev ...` or supervisor restart |
| Disk full | Prometheus alert | photo-save fails fast; workflow fails cleanly | prune photos, prune temporal history |
| Host memory > 95% | Alertmanager critical notification | workflow degrades as models swap; SLO p95 breaches | `ps | grep ollama`; stop foreign big models |
| Workflow stuck in retries | Temporal UI shows attempt > 10 | user can cancel via UI or signal | add to non-retryable types if deterministic |

All drills scripted into `make smoke --drills` (extended run, ~5min) so responses are **verified, not documented**.

### 5.7 Development workflow

```bash
# Day-to-day
make start-deps       # Temporal + Ollama + observability once
make dev              # api + detection with hot reload
# edit
make smoke            # before commit
make verify           # lint + unit + workflow + integration (no smoke)
git commit

# Pre-release
make stop
make start            # cold boot, production-like
make smoke --drills   # full verification including fault injection
```

### 5.8 Out of Section 5 scope

- Remote deployment (§6)
- Auth, RBAC, multi-tenancy
- Horizontal worker scaling (design supports it — unused today)
- DR beyond single-host backup

## Section 6 — Migration path

### 6.1 Tier 0 — today (what we're implementing)

- Host: Mac M4 Pro 48GB
- Models: Florence-2 (local MPS), Qwen2.5-VL 7B/3B + moondream (local Ollama)
- Temporal: dev server, SQLite, local
- Observability: Docker Grafana LGTM, local
- Cost: $0/mo
- Good for: dev, offline demos, privacy-sensitive data, proving the loop

### 6.2 Tier 1 — self-hosted GPU (first migration, optional)

**Trigger**: p95 latency exceeds budget after optimization, or multiple users, or want Mac back for other work.

Config changes only (no code):

| Component | Tier 0 | Tier 1 | Flip |
|---|---|---|---|
| detection-service | local | container on GPU box | `DETECTION_SERVICE_URL` |
| Ollama | local | on GPU box (or vLLM) | `OLLAMA_URL` |
| Temporal | local dev | local or on GPU | `TEMPORAL_HOST` |
| Observability | local | local (receives OTLP from GPU) | no change |
| Mobile app | mDNS | mDNS or direct IP | no change |

Hardware options: Mac Studio M2/M4 Ultra, NVIDIA tower, or GPU VPS (Hetzner, RunPod, Latitude). Target ≥24GB VRAM. Cost envelope: $0 (spare Mac) to ~$150-300/mo (rented GPU).

### 6.3 Tier 2 — hosted OSS models (when inference becomes someone else's problem)

**Trigger**: want zero infra work, accept small per-request cost, or want access to Qwen2.5-VL 72B-level quality without a $6K GPU.

Weights stay Apache 2.0. One-line env flip per tier:

```
TIER_1_PROVIDER=fireworks                                     # was: ollama
TIER_1_MODEL=accounts/fireworks/models/qwen2p5-vl-72b-instruct  # was: qwen2.5vl:7b
TIER_1_URL=https://api.fireworks.ai/inference/v1              # was: http://localhost:11434
TIER_1_API_KEY=fw_...                                         # first secret ever
```

`ObjectClassifier` interface is the seam. `FireworksClassifier` (~80 LoC, OpenAI-compatible HTTP) slots in by scheme-prefix dispatch in `createPipeline()`. Local fast-path remains as Tier 2+ fallback — architecture already covers it.

Cost envelope: ~$0.40 per 1000 images for Qwen 72B on Fireworks.

### 6.4 Tier 3 — Temporal Cloud (when dev server is the bottleneck)

**Trigger**: SQLite backend no longer scales, or multi-region, or SOC2.

Two env vars + TLS certs:

```
TEMPORAL_HOST=your-ns.tmprl.cloud:7233
TEMPORAL_NAMESPACE=your-ns.123abc
TEMPORAL_TLS_CERT=...
TEMPORAL_TLS_KEY=...
```

Same workflow code, same activities, same replay tests. Alternative: self-host Cassandra-backed Temporal on the GPU box for $0 extra.

Cost envelope: ~$200/mo entry, scales with volume. Self-hosted: $0 extra compute.

### 6.5 Tier 4 — distributed (if the app opens up beyond one household)

**Trigger**: multi-household, regional latency, compliance.

- Photo storage → S3-compatible (MinIO local, S3, R2) — `PhotoStorageService` adapter swap
- Auth → OAuth/OIDC in front of Fastify
- Inventory → Postgres as synced source of truth (mobile Drift stays offline-capable)
- Mobile → public API URL
- Observability → Grafana Cloud / Honeycomb / Datadog via OTel Collector config change

Out of scope for this plan. Listed to confirm the design doesn't box us out.

### 6.6 Invariants across all tiers

- Workflow code — unchanged Tier 0 → Tier 4
- Activity code — unchanged
- Tier chain logic — unchanged
- OTel instrumentation — unchanged
- Metric names — unchanged
- Log field names — unchanged
- Mobile networking — unchanged (env var for base URL only)
- SLI/SLO definitions — unchanged
- Smoke test script — unchanged (works against any tier)

Anything that would force workflow-code rewrite to migrate is a **design bug**, caught now.

### 6.7 Explicit anti-goals

- Mobile offline-first SQLite stays forever; cloud sync is additive, never replacing
- No provider lock-in — classifier adapter is OpenAI-compatible HTTP, not Fireworks-SDK-specific
- Temporal lock-in is accepted explicitly (can port workflow to successor if needed; activities are plain functions)
- No model-name hardcoding in prompts or code — always config

## Explicitly Out of Scope (this plan)

- Remote deployment / multi-tenancy / auth
- Android support
- SSE streaming detection (sync request/response for v1)
- CoreML on-device detection (future Apple FastVLM optimization)
- Real-time bounding box preview
- Horizontal scaling (design supports it; unused today)
- User-facing photo/inventory management UI beyond the existing flow

## Success Criteria

This design succeeds when:

1. `make start` boots the entire stack (obs + Temporal + detection + Ollama + api + worker + warm-up) to verified-healthy in under 3 minutes cold, under 45s warm.
2. `make smoke` exits green against rolling-100-run SLOs: ≥99% success, p95 ≤ 25s, p99 ≤ 45s, tier-1 rate ≥ 80%.
3. Unit + workflow + integration tests all green; `make verify` returns 0.
4. Induced failures (Ollama stop, worker kill, detection crash) are handled automatically — smoke drills pass.
5. Temporal UI shows every recent workflow with full activity waterfalls; Grafana dashboards show live metrics; trace_id correlates across both.
6. Zero scratch debug files in repo root; all debug output goes to `~/allmythings-data/smoke-runs/` or Loki.
7. Legacy provider/pipeline files removed; no test asserts obsolete response shapes.
8. A one-line env change migrates Tier 0 → Tier 1 → Tier 2 without code edits — validated by running smoke against a mocked "remote" provider.

## Open questions / flagged for implementation plan

- Should detection-service also expose a Florence caption-only endpoint (no box) to skip unnecessary work on the final tier-4 fallback, or reuse existing `/detect/florence` and discard boxes? (Lean: reuse, simpler.)
- Should api-service and Temporal worker be one process or two? (Lean: one process for dev, same `tsx` run; split at Tier 1 if throughput demands it.)
- Should we use `temporal server start-dev` SQLite mode, or run the full Temporal docker-compose with Postgres? (Lean: dev mode for Tier 0 simplicity; upgrade at Tier 1.)
- Replay test fixtures: what's the policy for regenerating when intentional workflow changes happen? (Lean: new fixture per deliberate change, old fixture kept to assert backward-compat.)

These are implementation-plan-level questions, not blockers for this design.
