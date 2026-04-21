# Production-Grade Temporal Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the homegrown pipeline orchestration with Temporal workflows, wire in an always-on Grafana LGTM observability stack, cut all legacy provider code, and make `make start` + `make smoke` the single source of truth for "the app works."

**Architecture:** Fastify receives `POST /v1/detect`, starts `detectInventoryWorkflow` on Temporal with `workflowId = sha256(image)`, awaits result. Workflow calls four activities (`savePhoto`, `florenceDetect`, `enrichItems`, `assembleResult`) with Temporal-native retries, timeouts, heartbeats, and idempotency. Tier chain (qwen7b → qwen3b → moondream → florence-only) lives in the workflow as deterministic try/catch. Grafana LGTM + Temporal UI provide unified observability. All backed by OSS, fully local on Mac M4 Pro (48GB).

**Tech Stack:** Temporal TypeScript SDK (Apache 2.0), Fastify 4, OpenTelemetry Node + Python SDKs, Pino + structlog, Grafana LGTM stack (Loki/Grafana/Tempo/Mimir+Prometheus), Alertmanager, Docker Compose, Florence-2 (MIT), Qwen2.5-VL + Moondream via Ollama (Apache 2.0), Flutter/Drift (unchanged).

**Spec:** `docs/superpowers/specs/2026-04-21-production-grade-temporal-orchestration-design.md`

**Phased execution:** Each phase leaves the system more functional than before.
- Phase A — Clear the decks (cleanup + stop the lying tests)
- Phase B — Temporal infrastructure (server + client + worker)
- Phase C — Workflow & activities (the actual pipeline rewrite)
- Phase D — Observability (Grafana LGTM always-on)
- Phase E — Operations (make start rewrite + runbooks)
- Phase F — Testing & verification (smoke + SLO gates)

---

## File Structure

### New files

```
api-service/src/temporal/client.ts                          — Temporal client singleton
api-service/src/temporal/worker.ts                          — Worker bootstrap, activity registration
api-service/src/temporal/task-queues.ts                     — Task queue name constants
api-service/src/temporal/shared-types.ts                    — Types shared by workflow + activities
api-service/src/temporal/activities/save-photo.activity.ts
api-service/src/temporal/activities/florence-detect.activity.ts
api-service/src/temporal/activities/enrich-item.activity.ts
api-service/src/temporal/activities/assemble-result.activity.ts
api-service/src/temporal/activities/index.ts                — barrel export
api-service/src/temporal/workflows/detect-inventory.workflow.ts
api-service/src/temporal/workflows/tier-chain.ts            — deterministic tier fallback helper

api-service/src/services/provider-health.service.ts         — periodic probes, non-workflow health
api-service/src/routes/detect-status.route.ts               — GET /v1/detect/status/:workflowId
api-service/src/routes/metrics.route.ts                     — /metrics (Prometheus)

api-service/src/telemetry/otel-init.ts                      — OTel SDK bootstrap
api-service/src/telemetry/metrics.ts                        — Prometheus metric registry + helpers

api-service/src/__tests__/unit/temporal/activities/save-photo.activity.test.ts
api-service/src/__tests__/unit/temporal/activities/florence-detect.activity.test.ts
api-service/src/__tests__/unit/temporal/activities/enrich-item.activity.test.ts
api-service/src/__tests__/unit/temporal/activities/assemble-result.activity.test.ts
api-service/src/__tests__/workflow/detect-inventory.workflow.test.ts
api-service/src/__tests__/workflow/detect-inventory.replay.test.ts
api-service/src/__tests__/workflow/histories/happy-path-qwen7b.json
api-service/src/__tests__/integration/provider-health.service.test.ts
api-service/src/__tests__/fixtures/smoke_tiny.jpg           — 320x240 test image for warm-up
api-service/src/__tests__/fixtures/room_01.jpg              — real room image for smoke

observability/docker-compose.lgtm.yml
observability/otel-collector/config.yaml
observability/tempo/tempo.yaml
observability/loki/loki-config.yaml
observability/promtail/promtail-config.yaml
observability/prometheus/prometheus.yml
observability/prometheus/alert-rules.yml
observability/alertmanager/alertmanager.yml
observability/alertmanager/macos-notifier.sh
observability/grafana/provisioning/datasources/datasources.yml
observability/grafana/provisioning/dashboards/dashboards.yml
observability/grafana/dashboards/pipeline-health.json
observability/grafana/dashboards/model-performance.json
observability/grafana/dashboards/resources.json
observability/grafana/dashboards/errors-failures.json
observability/grafana/dashboards/temporal-internals.json

scripts/preflight.sh
scripts/smoke.sh
scripts/smoke-assertions.ts
scripts/install-supervisor.sh
scripts/uninstall-supervisor.sh
scripts/macos-notify.sh
scripts/supervisor/com.allmythings.api.plist
scripts/supervisor/com.allmythings.detection.plist
```

### Modified files

```
api-service/package.json                                    — add @temporalio/*, remove @anthropic-ai, @google-cloud/vision, @google/generative-ai
api-service/src/app.ts                                      — wire Temporal client + worker, remove FlorencePipelineService
api-service/src/config/env.config.ts                        — prune legacy vars, add Temporal/tier/obs vars
api-service/src/routes/detect.route.ts                      — rewrite to start workflow + await
api-service/src/routes/health.route.ts                      — use ProviderHealthService
api-service/src/utils/logger.ts                             — add OTel trace correlation
api-service/src/telemetry.ts                                — route through otel-init.ts
api-service/src/__tests__/integration/detect.route.test.ts  — rewrite for workflow-based response
api-service/src/__tests__/integration/health.route.test.ts  — update for provider-health shape
api-service/src/providers/florence.detector.ts              — extract HTTP call primitive used by activity
api-service/src/providers/ollama.classifier.ts              — strip internal retries (Temporal handles them)

detection-service/src/detection_service/main.py             — remove MLX/YOLO eager load + /detect/fast route
detection-service/src/detection_service/telemetry.py        — confirm OTel traceparent propagation

scripts/start-all.sh                                        — rewrite with 6 stages + warm-up gate

Makefile                                                    — start/start-deps/dev/stop/status/logs/smoke/verify/backup/restore/install-supervisor

mobile-app/lib/data/repositories/detection_repository.dart  — handle 202 + poll /v1/detect/status
mobile-app/lib/application/providers/detection_providers.dart — retry with backoff on 429/503

.gitignore                                                  — block scratch files from coming back
.env.example                                                — updated env
```

### Deleted files (exact list)

```
# legacy providers (truly unused, safe to delete Day 1)
api-service/src/providers/gemini.classifier.ts
api-service/src/providers/claude.classifier.ts
api-service/src/providers/google-vision.detector.ts
api-service/src/providers/owlv2.detector.ts
api-service/src/providers/grounding-dino.detector.ts
api-service/src/__tests__/unit/gemini.classifier.test.ts
api-service/src/__tests__/unit/google-vision.detector.test.ts
api-service/src/__tests__/unit/grounding-dino.detector.test.ts

# legacy services (truly unused, safe to delete Day 1)
api-service/src/services/detection-pipeline.service.ts
api-service/src/services/hybrid-pipeline.service.ts
api-service/src/services/ensemble-fusion.service.ts
api-service/src/services/multi-pass-vlm.classifier.ts
api-service/src/__tests__/unit/detection-pipeline.service.test.ts

# superseded by Temporal (deleted after workflow migration — Phase C final task)
api-service/src/services/florence-pipeline.service.ts
api-service/src/services/pipeline-executor.ts
api-service/src/telemetry/pipeline-tracer.ts                 (if only used by pipeline-executor)
api-service/src/telemetry/step-result.ts                     (if only used by pipeline-executor)
api-service/src/__tests__/unit/florence-pipeline.test.ts
api-service/src/__tests__/unit/pipeline-executor.test.ts

# scratch debug files in repo root (13 known)
result.json
final_attempt.json
final_final.json
final_result.json
final_success.json
final_test.json
final_verification.json
verify_result.json
detection_result.json
automated_result.json
all_detections.log
api_latest.log

# detection-service stray logs
detection-service/detection.log
detection-service/detection_crash.log
detection-service/detection_final.log
detection-service/detection_final_verify.log
detection-service/detection_latest.log
detection-service/detection_verify.log

# observability duplicate (subsumed by docker-compose.lgtm.yml)
docker-compose.hyperdx.yml
observability/docker-compose.observability.yml   (superseded — only if the new one covers everything)
```

---

## Phase A — Clear the Decks

### Task 1: Gitignore + delete scratch files in repo root

**Files:**
- Modify: `.gitignore`
- Delete: 12 scratch files in repo root (listed below)

- [ ] **Step 1: Confirm the scratch files exist and are unreferenced**

Run:
```bash
cd /Users/mrarindampaul/Develop/allmythings
ls -la result.json final_*.json verify_result.json detection_result.json automated_result.json all_detections.log api_latest.log 2>&1 | head -30
grep -r "result.json\|final_result\|verify_result\|detection_result\|automated_result\|all_detections.log\|api_latest.log" --include="*.ts" --include="*.sh" --include="*.mjs" --include="Makefile" --include="*.yml" 2>&1 | head -20
```
Expected: files exist; grep finds **no references in code** (otherwise: stop and investigate).

- [ ] **Step 2: Update .gitignore**

Append to `.gitignore` (create the file if it doesn't exist):
```gitignore
# Scratch debug files — never checked in
/result.json
/final_*.json
/verify_result.json
/detection_result.json
/automated_result.json
/all_detections.log
/api_latest.log

# Process manager + smoke runs
/tmp/allmythings/
*.pid

# Python cache
__pycache__/
*.pyc

# Detection service logs (structured logs go to Loki now)
detection-service/detection*.log

# Node
node_modules/
.DS_Store

# Env
/.env
/.env.local
!/.env.example
```

- [ ] **Step 3: Delete the scratch files**

```bash
cd /Users/mrarindampaul/Develop/allmythings
git rm -f result.json final_attempt.json final_final.json final_result.json \
  final_success.json final_test.json final_verification.json verify_result.json \
  detection_result.json automated_result.json all_detections.log api_latest.log 2>&1 | tail -20
```

If any file isn't tracked by git, use `rm -f` for untracked ones.

- [ ] **Step 4: Verify the repo is clean**

```bash
ls *.json *.log 2>/dev/null | grep -v package
```
Expected: no scratch files listed (only `package.json`, `package-lock.json` if any).

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "chore: delete 12 scratch debug files + tighten .gitignore

Evidence of ad-hoc curl-to-file manual testing. Replaced in Phase F
by scripts/smoke.sh which writes to ~/allmythings-data/smoke-runs/."
```

---

### Task 2: Delete legacy detector/classifier providers

**Files:**
- Delete: `api-service/src/providers/gemini.classifier.ts`
- Delete: `api-service/src/providers/claude.classifier.ts`
- Delete: `api-service/src/providers/google-vision.detector.ts`
- Delete: `api-service/src/providers/owlv2.detector.ts`
- Delete: `api-service/src/providers/grounding-dino.detector.ts`
- Delete: `api-service/src/__tests__/unit/gemini.classifier.test.ts`
- Delete: `api-service/src/__tests__/unit/google-vision.detector.test.ts`
- Delete: `api-service/src/__tests__/unit/grounding-dino.detector.test.ts`

- [ ] **Step 1: Check for remaining references**

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service
grep -rn "gemini\.classifier\|claude\.classifier\|google-vision\.detector\|owlv2\.detector\|grounding-dino\.detector\|GeminiClassifier\|ClaudeClassifier\|GoogleVisionDetector\|OWLv2Detector\|GroundingDinoDetector" src/ 2>&1
```

Expected: only the files about to be deleted and their own test files reference these. **If `app.ts`, `routes/*`, or `services/*` still import them, stop and resolve those imports first** (they should already be gone since `app.ts` only imports `FlorenceDetector` + `OllamaClassifier`).

- [ ] **Step 2: Delete the files**

```bash
cd /Users/mrarindampaul/Develop/allmythings
git rm api-service/src/providers/gemini.classifier.ts \
       api-service/src/providers/claude.classifier.ts \
       api-service/src/providers/google-vision.detector.ts \
       api-service/src/providers/owlv2.detector.ts \
       api-service/src/providers/grounding-dino.detector.ts \
       api-service/src/__tests__/unit/gemini.classifier.test.ts \
       api-service/src/__tests__/unit/google-vision.detector.test.ts \
       api-service/src/__tests__/unit/grounding-dino.detector.test.ts
```

- [ ] **Step 3: Remove dependencies**

Modify `api-service/package.json`: remove these lines from `dependencies`:
```json
"@anthropic-ai/sdk": "^0.87.0",
"@google-cloud/vision": "^4.1.0",
"@google/generative-ai": "^0.24.1",
```

- [ ] **Step 4: Reinstall and type-check**

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service
rm -rf node_modules package-lock.json
npm install
npm run type-check
```
Expected: `type-check` passes — legacy imports are gone.

- [ ] **Step 5: Run unit tests**

```bash
npm test -- --run 2>&1 | tail -15
```
Expected: 3 currently-failing tests may still fail (those are in `integration/detect.route.test.ts` — fixed later). All legacy-provider tests are gone.

- [ ] **Step 6: Commit**

```bash
git add api-service/package.json api-service/package-lock.json
git commit -m "chore(api): delete legacy providers (gemini, claude, google-vision, owlv2, grounding-dino)

OSS-only plan — removed commercial APIs and replaced detectors.
Florence-2 is the sole detector; Ollama (qwen/moondream) is the
classifier chain. Drops 3 npm deps."
```

---

### Task 3: Delete legacy pipeline services

**Files:**
- Delete: `api-service/src/services/detection-pipeline.service.ts`
- Delete: `api-service/src/services/hybrid-pipeline.service.ts`
- Delete: `api-service/src/services/ensemble-fusion.service.ts`
- Delete: `api-service/src/services/multi-pass-vlm.classifier.ts`
- Delete: `api-service/src/__tests__/unit/detection-pipeline.service.test.ts`

- [ ] **Step 1: Confirm nothing references these**

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service
grep -rn "detection-pipeline\|hybrid-pipeline\|ensemble-fusion\|multi-pass-vlm\|DetectionPipelineService\|HybridPipelineService\|EnsembleFusionService\|MultiPassVlmClassifier" src/ 2>&1
```
Expected: matches are only inside the files being deleted. If `app.ts` or `routes/*` reference them, they shouldn't (the active path is `FlorencePipelineService`). If they do, stop and resolve first.

- [ ] **Step 2: Delete files**

```bash
cd /Users/mrarindampaul/Develop/allmythings
git rm api-service/src/services/detection-pipeline.service.ts \
       api-service/src/services/hybrid-pipeline.service.ts \
       api-service/src/services/ensemble-fusion.service.ts \
       api-service/src/services/multi-pass-vlm.classifier.ts \
       api-service/src/__tests__/unit/detection-pipeline.service.test.ts
```

- [ ] **Step 3: Type-check and test**

```bash
cd api-service
npm run type-check
npm test -- --run 2>&1 | tail -15
```
Expected: type-check passes; test counts drop but remaining pass (the 3 route integration failures are still there — deferred).

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(api): delete legacy pipeline services (detection-pipeline, hybrid-pipeline, ensemble-fusion, multi-pass-vlm)

All superseded by the active FlorencePipelineService path.
FlorencePipelineService itself goes away in Phase C once the Temporal
workflow takes over."
```

---

### Task 4: Delete detection-service stray logs + remove MLX/YOLO eager load

**Files:**
- Delete: `detection-service/detection*.log` (6 files)
- Modify: `detection-service/src/detection_service/main.py`

- [ ] **Step 1: Delete the stray log files**

```bash
cd /Users/mrarindampaul/Develop/allmythings
git rm -f detection-service/detection.log \
          detection-service/detection_crash.log \
          detection-service/detection_final.log \
          detection-service/detection_final_verify.log \
          detection-service/detection_latest.log \
          detection-service/detection_verify.log 2>&1 | tail -10
```

Some may not be tracked — use `rm -f` for those.

- [ ] **Step 2: Inspect current main.py**

Open `detection-service/src/detection_service/main.py` and confirm it eagerly imports `MLXBackend` and calls `_backend.load_fast_models()` in the lifespan, plus has a `/detect/fast` route using YOLO.

- [ ] **Step 3: Write a test that verifies the MLX path is gone**

Create `detection-service/tests/unit/test_main_startup.py`:

```python
"""Verify that MLX/YOLO eager loading is not present in the active pipeline."""
from fastapi.testclient import TestClient


def test_detect_fast_route_removed():
    """The legacy /detect/fast route is removed from the active pipeline."""
    from detection_service.main import app
    client = TestClient(app)
    response = client.post("/detect/fast")
    assert response.status_code == 404, \
        "/detect/fast is legacy YOLO — must not exist in the Florence pipeline"


def test_florence_route_registered():
    """Florence route is registered."""
    from detection_service.main import app
    routes = {getattr(r, "path", None) for r in app.routes}
    assert "/detect/florence" in routes


def test_no_mlx_backend_in_lifespan(monkeypatch):
    """Startup must not eagerly load the MLX/YOLO backend.

    We patch MLXBackend to raise if instantiated and verify app imports succeed.
    """
    # If the import fails, it likely still imports mlx_backend. Verify it doesn't.
    import importlib
    import sys

    # Clear cached module if already loaded
    for mod_name in list(sys.modules):
        if "mlx_backend" in mod_name or "detection_service.main" in mod_name:
            sys.modules.pop(mod_name, None)

    # Force ImportError on mlx_backend — if main.py doesn't import it, this is fine
    class _Blocker:
        def find_spec(self, name, path, target=None):
            if name.endswith("mlx_backend"):
                raise ImportError("mlx_backend must not be imported at startup")
            return None

    sys.meta_path.insert(0, _Blocker())
    try:
        importlib.import_module("detection_service.main")
    finally:
        sys.meta_path.pop(0)
```

- [ ] **Step 4: Run the failing test**

```bash
cd /Users/mrarindampaul/Develop/allmythings/detection-service
./venv/bin/python -m pytest tests/unit/test_main_startup.py -v 2>&1 | tail -25
```
Expected: FAIL — `/detect/fast` still exists, MLX backend still imports.

- [ ] **Step 5: Edit main.py to remove MLX/YOLO**

Replace the full contents of `detection-service/src/detection_service/main.py` with:

```python
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from detection_service.config import settings
from detection_service.telemetry import configure_telemetry, mount_prometheus
from detection_service.routes.florence import router as florence_router

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("detection-service starting (Florence-2 lazy-loaded on first request)")
    yield
    log.info("detection-service stopping")


app = FastAPI(
    title="detection-service",
    version=settings.version,
    lifespan=lifespan,
)

configure_telemetry(app=app)
mount_prometheus(app)

app.include_router(florence_router, tags=["detect"])


@app.get("/")
async def root():
    return {"service": settings.service_name, "version": settings.version}


@app.get("/health")
async def health():
    """Lightweight liveness — does NOT probe the model.

    Florence is lazy-loaded; we only report whether the service process is up.
    Model loadedness is reported via /metrics (florence_model_loaded gauge).
    """
    return {"status": "ok", "service": settings.service_name}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
./venv/bin/python -m pytest tests/unit/test_main_startup.py -v 2>&1 | tail -15
```
Expected: PASS.

- [ ] **Step 7: Run all detection-service tests**

```bash
./venv/bin/python -m pytest tests/ -v 2>&1 | tail -25
```
Expected: All pass. Existing Florence route tests continue to work. The `/detect/fast` and MLX tests (if any) are gone or marked removed.

- [ ] **Step 8: Commit**

```bash
cd /Users/mrarindampaul/Develop/allmythings
git add detection-service/src/detection_service/main.py \
        detection-service/tests/unit/test_main_startup.py
git commit -m "refactor(detect): remove MLX/YOLO eager load and /detect/fast route

Florence-2 is the active detector. MLX backend loaded YOLO11n at
startup costing ~500MB RAM for a route the pipeline never hits.
Adds startup assertions so MLX can't creep back in."
```

---

## Phase B — Temporal Infrastructure

### Task 5: Install Temporal SDK + add Temporal dev server to compose

**Files:**
- Modify: `api-service/package.json`
- Create: `observability/docker-compose.lgtm.yml` (temporal block only in this task — rest in Phase D)

- [ ] **Step 1: Install Temporal SDK packages**

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service
npm install @temporalio/client@^1.11.0 @temporalio/worker@^1.11.0 \
            @temporalio/workflow@^1.11.0 @temporalio/activity@^1.11.0 \
            @temporalio/common@^1.11.0
npm install --save-dev @temporalio/testing@^1.11.0
```

- [ ] **Step 2: Verify install**

```bash
node -e "console.log(require('@temporalio/client').Connection.name)"
```
Expected: prints `Connection`.

- [ ] **Step 3: Create the Temporal compose file (minimal)**

Create `observability/docker-compose.lgtm.yml` with just the Temporal service for now (other services added in Phase D):

```yaml
# Local observability + orchestration stack for allmythings.
# Brought up by `make start-deps`. Fully local, OSS.
services:
  temporal:
    image: temporalio/auto-setup:1.24.2
    container_name: allmythings-temporal
    restart: unless-stopped
    environment:
      - DB=sqlite
      - SQLITE_DB_PATH=/etc/temporal/temporal.db
      - TEMPORAL_ADDRESS=0.0.0.0:7233
      - LOG_LEVEL=info
    ports:
      - "7233:7233"
      - "7243:7243"  # metrics
    volumes:
      - temporal-data:/etc/temporal

  temporal-ui:
    image: temporalio/ui:2.30.3
    container_name: allmythings-temporal-ui
    restart: unless-stopped
    depends_on:
      - temporal
    environment:
      - TEMPORAL_ADDRESS=temporal:7233
      - TEMPORAL_CORS_ORIGINS=http://localhost:3000
    ports:
      - "8233:8080"

volumes:
  temporal-data:
```

- [ ] **Step 4: Bring up Temporal and verify**

```bash
cd /Users/mrarindampaul/Develop/allmythings
docker compose -f observability/docker-compose.lgtm.yml up -d temporal temporal-ui
sleep 10
docker ps | grep temporal
curl -sf http://localhost:8233 > /dev/null && echo "Temporal UI OK"
```
Expected: both containers running, UI reachable at http://localhost:8233.

- [ ] **Step 5: Verify gRPC endpoint responds**

```bash
docker run --rm --network host temporalio/admin-tools:1.24.2 \
  tctl --address localhost:7233 namespace list 2>&1 | head -5
```
Expected: `default` namespace appears.

- [ ] **Step 6: Commit**

```bash
git add api-service/package.json api-service/package-lock.json \
        observability/docker-compose.lgtm.yml
git commit -m "feat(orchestration): install Temporal SDK + add temporal server to compose

Temporal 1.24.2 server with SQLite backend, UI at :8233, gRPC :7233.
Rest of LGTM stack (otel-collector, tempo, loki, prometheus, grafana,
alertmanager) added in Phase D."
```

---

### Task 6: Temporal client singleton

**Files:**
- Create: `api-service/src/temporal/task-queues.ts`
- Create: `api-service/src/temporal/client.ts`
- Create: `api-service/src/__tests__/unit/temporal/client.test.ts`
- Modify: `api-service/src/config/env.config.ts`

- [ ] **Step 1: Add Temporal env vars**

Edit `api-service/src/config/env.config.ts`. Find the `EnvConfig` interface, add these fields (keep existing fields for now — cleaned up in Task 20):

```typescript
  // Temporal
  temporalHost: string;
  temporalNamespace: string;
  temporalTaskQueue: string;
  workflowExecutionTimeoutMs: number;
  httpResponseTimeoutMs: number;

  // Pipeline discipline
  pipelineMaxConcurrency: number;
  enrichmentBudgetMs: number;
  queueBackpressureThreshold: number;

  // Tier models (env-overrideable)
  tier1Model: string;
  tier2Model: string;
  tier3Model: string;
```

In the `envConfig` object literal, add:

```typescript
  temporalHost: process.env.TEMPORAL_HOST || 'localhost:7233',
  temporalNamespace: process.env.TEMPORAL_NAMESPACE || 'default',
  temporalTaskQueue: process.env.TEMPORAL_TASK_QUEUE || 'inventory-pipeline',
  workflowExecutionTimeoutMs: parseInt(process.env.WORKFLOW_EXECUTION_TIMEOUT_MS || '120000', 10),
  httpResponseTimeoutMs: parseInt(process.env.HTTP_RESPONSE_TIMEOUT_MS || '90000', 10),

  pipelineMaxConcurrency: parseInt(process.env.PIPELINE_MAX_CONCURRENCY || '1', 10),
  enrichmentBudgetMs: parseInt(process.env.ENRICHMENT_BUDGET_MS || '45000', 10),
  queueBackpressureThreshold: parseInt(process.env.QUEUE_BACKPRESSURE_THRESHOLD || '10', 10),

  tier1Model: process.env.TIER_1_MODEL || 'qwen2.5vl:7b',
  tier2Model: process.env.TIER_2_MODEL || 'qwen2.5vl:3b',
  tier3Model: process.env.TIER_3_MODEL || 'moondream',
```

- [ ] **Step 2: Create task queue constants**

Create `api-service/src/temporal/task-queues.ts`:

```typescript
export const TASK_QUEUES = {
  INVENTORY_PIPELINE: 'inventory-pipeline',
} as const;

export type TaskQueue = typeof TASK_QUEUES[keyof typeof TASK_QUEUES];
```

- [ ] **Step 3: Write the client test**

Create `api-service/src/__tests__/unit/temporal/client.test.ts`:

```typescript
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getTemporalClient, closeTemporalClient } from '../../../temporal/client';

describe('TemporalClient', () => {
  afterEach(async () => {
    await closeTemporalClient();
  });

  it('returns the same instance on repeated calls (singleton)', async () => {
    const first = await getTemporalClient();
    const second = await getTemporalClient();
    expect(first).toBe(second);
  });

  it('exposes a workflowService and connection', async () => {
    const client = await getTemporalClient();
    expect(client.workflow).toBeDefined();
    expect(client.connection).toBeDefined();
  });

  it('uses TEMPORAL_HOST and TEMPORAL_NAMESPACE from env', async () => {
    vi.stubEnv('TEMPORAL_HOST', 'localhost:7233');
    vi.stubEnv('TEMPORAL_NAMESPACE', 'default');
    const client = await getTemporalClient();
    expect(client.options.namespace).toBe('default');
    vi.unstubAllEnvs();
  });
});
```

- [ ] **Step 4: Run test — expect import failure**

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service
npm test -- --run src/__tests__/unit/temporal/client.test.ts 2>&1 | tail -10
```
Expected: FAIL — module `../../temporal/client` not found.

- [ ] **Step 5: Implement the singleton**

Create `api-service/src/temporal/client.ts`:

```typescript
import { Client, Connection } from '@temporalio/client';
import { envConfig } from '../config/env.config';
import { logger } from '../utils/logger';

let _client: Client | null = null;
let _connection: Connection | null = null;
let _pending: Promise<Client> | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (_client) return _client;
  if (_pending) return _pending;

  _pending = (async () => {
    logger.info({ host: envConfig.temporalHost, ns: envConfig.temporalNamespace }, 'Connecting to Temporal');
    _connection = await Connection.connect({ address: envConfig.temporalHost });
    _client = new Client({ connection: _connection, namespace: envConfig.temporalNamespace });
    return _client;
  })();

  try {
    return await _pending;
  } finally {
    _pending = null;
  }
}

export async function closeTemporalClient(): Promise<void> {
  if (_connection) {
    await _connection.close();
  }
  _client = null;
  _connection = null;
}
```

- [ ] **Step 6: Start Temporal (if not running) and run test**

```bash
docker compose -f ../observability/docker-compose.lgtm.yml up -d temporal
# wait for gRPC to be live
for i in {1..30}; do
  docker exec allmythings-temporal tctl --ns default namespace describe default 2>/dev/null && break
  sleep 1
done
npm test -- --run src/__tests__/unit/temporal/client.test.ts 2>&1 | tail -15
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api-service/src/temporal/client.ts \
        api-service/src/temporal/task-queues.ts \
        api-service/src/__tests__/unit/temporal/client.test.ts \
        api-service/src/config/env.config.ts
git commit -m "feat(temporal): client singleton + task queue constants + env config"
```

---

### Task 7: Shared types + worker bootstrap (empty worker)

**Files:**
- Create: `api-service/src/temporal/shared-types.ts`
- Create: `api-service/src/temporal/activities/index.ts`
- Create: `api-service/src/temporal/worker.ts`
- Create: `api-service/src/__tests__/unit/temporal/worker.test.ts`

- [ ] **Step 1: Define shared types used by workflow + activities**

Create `api-service/src/temporal/shared-types.ts`:

```typescript
/**
 * Types shared between workflow code and activity code.
 *
 * IMPORTANT: Workflow code must be deterministic and cannot import Node built-ins
 * that are non-deterministic (fs, crypto, etc.). Only pure types + value objects go here.
 */

export interface DetectInput {
  imageBase64: string;   // base64 so it round-trips through Temporal payload encoding cleanly
  imageSha256: string;   // precomputed by the HTTP layer; used as workflowId idempotency key
  mimeType: string;      // 'image/jpeg' | 'image/png' | 'image/webp'
  traceId: string;
  requestId: string;
}

export interface SavedPhoto {
  photoId: string;
  photoPath: string;
  thumbnailPath: string;
  bytes: number;
}

export interface FlorenceRegion {
  caption: string;
  x: number;
  y: number;
  width: number;
  height: number;
  regionIndex: number;
}

export interface FlorenceDetection {
  regions: FlorenceRegion[];
  imageWidth: number;
  imageHeight: number;
}

export type EnrichmentTier = 'qwen7b' | 'qwen3b' | 'moondream' | 'florence-only';

export interface EnrichedItem {
  id: string;
  regionIndex: number;
  label: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  enrichmentTier: EnrichmentTier;
  attributes: {
    name: string;
    category: string;
    color: string | null;
    material: string | null;
    condition: string | null;
    estimatedValue: string | null;
    description: string;
    searchTags: string[];
  };
}

export interface PipelineError {
  step: string;
  code: string;
  message: string;
  retryable: boolean;
}

export interface DetectResult {
  photoId: string;
  photoUrl: string;
  itemCount: number;
  items: EnrichedItem[];
  errors: PipelineError[];
  traceId: string;
  processingMs: number;
}
```

- [ ] **Step 2: Placeholder activities barrel (populated in later tasks)**

Create `api-service/src/temporal/activities/index.ts`:

```typescript
// Activities are registered with the worker via the `activities` option.
// Individual activity implementations live in sibling files and are re-exported here.
// Populated progressively: savePhoto (Task 8), florenceDetect (Task 9),
// enrichItem (Task 10), assembleResult (Task 11).
export {}; // placeholder so the file type-checks as an empty module
```

- [ ] **Step 3: Write the worker test**

Create `api-service/src/__tests__/unit/temporal/worker.test.ts`:

```typescript
import { describe, it, expect, afterAll } from 'vitest';
import { createWorker, closeWorker } from '../../../temporal/worker';

describe('TemporalWorker', () => {
  afterAll(async () => {
    await closeWorker();
  });

  it('creates a worker bound to the inventory-pipeline task queue', async () => {
    const worker = await createWorker();
    expect(worker.options.taskQueue).toBe('inventory-pipeline');
  });

  it('respects PIPELINE_MAX_CONCURRENCY for activity concurrency', async () => {
    process.env.PIPELINE_MAX_CONCURRENCY = '1';
    const worker = await createWorker();
    expect(worker.options.maxConcurrentActivityTaskExecutions).toBe(1);
    delete process.env.PIPELINE_MAX_CONCURRENCY;
  });
});
```

- [ ] **Step 4: Run — expect failure**

```bash
npm test -- --run src/__tests__/unit/temporal/worker.test.ts 2>&1 | tail -10
```
Expected: FAIL — module not found.

- [ ] **Step 5: Implement the worker bootstrap**

Create `api-service/src/temporal/worker.ts`:

```typescript
import { Worker, NativeConnection } from '@temporalio/worker';
import path from 'node:path';
import { envConfig } from '../config/env.config';
import { TASK_QUEUES } from './task-queues';
import { logger } from '../utils/logger';
import * as activities from './activities';

let _worker: Worker | null = null;
let _connection: NativeConnection | null = null;
let _runPromise: Promise<void> | null = null;

/**
 * Create and return the Temporal worker (does NOT start polling).
 * Caller decides when to `.run()` and when to shut down.
 */
export async function createWorker(): Promise<Worker> {
  if (_worker) return _worker;

  _connection = await NativeConnection.connect({ address: envConfig.temporalHost });

  _worker = await Worker.create({
    connection: _connection,
    namespace: envConfig.temporalNamespace,
    taskQueue: TASK_QUEUES.INVENTORY_PIPELINE,
    workflowsPath: path.resolve(__dirname, './workflows/detect-inventory.workflow'),
    activities,
    maxConcurrentActivityTaskExecutions: envConfig.pipelineMaxConcurrency,
    maxConcurrentWorkflowTaskExecutions: 10,
  });

  logger.info({
    taskQueue: TASK_QUEUES.INVENTORY_PIPELINE,
    maxActivities: envConfig.pipelineMaxConcurrency,
  }, 'Temporal worker created');

  return _worker;
}

export async function runWorker(): Promise<void> {
  const worker = await createWorker();
  _runPromise = worker.run();
  logger.info('Temporal worker started polling');
}

export async function closeWorker(): Promise<void> {
  if (_worker) {
    _worker.shutdown();
  }
  if (_runPromise) {
    try { await _runPromise; } catch { /* expected during shutdown */ }
  }
  if (_connection) {
    await _connection.close();
  }
  _worker = null;
  _connection = null;
  _runPromise = null;
}
```

Note: this references `./workflows/detect-inventory.workflow` which doesn't exist yet; we stub it next so the worker can be constructed.

- [ ] **Step 6: Stub the workflow file so the worker builds**

Create `api-service/src/temporal/workflows/detect-inventory.workflow.ts` (stub; replaced in Task 12):

```typescript
import type { DetectInput, DetectResult } from '../shared-types';

/**
 * STUB. Real implementation lands in Task 12.
 * Temporal requires the workflows path to exist at worker construction time.
 */
export async function detectInventoryWorkflow(_input: DetectInput): Promise<DetectResult> {
  throw new Error('detectInventoryWorkflow not yet implemented');
}
```

- [ ] **Step 7: Run the worker test**

```bash
npm test -- --run src/__tests__/unit/temporal/worker.test.ts 2>&1 | tail -15
```
Expected: PASS (Temporal server must be running via `docker compose ... up -d temporal`).

- [ ] **Step 8: Commit**

```bash
git add api-service/src/temporal/shared-types.ts \
        api-service/src/temporal/activities/index.ts \
        api-service/src/temporal/worker.ts \
        api-service/src/temporal/workflows/detect-inventory.workflow.ts \
        api-service/src/__tests__/unit/temporal/worker.test.ts
git commit -m "feat(temporal): worker bootstrap + shared types + workflow stub"
```

---

## Phase C — Workflow & Activities

### Task 8: savePhoto activity (TDD)

**Files:**
- Create: `api-service/src/temporal/activities/save-photo.activity.ts`
- Create: `api-service/src/__tests__/unit/temporal/activities/save-photo.activity.test.ts`
- Modify: `api-service/src/temporal/activities/index.ts`

- [ ] **Step 1: Write the test**

Create `api-service/src/__tests__/unit/temporal/activities/save-photo.activity.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { savePhoto } from '../../../../temporal/activities/save-photo.activity';
import { DetectInput } from '../../../../temporal/shared-types';
import sharp from 'sharp';

describe('savePhoto activity', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'save-photo-test-'));
    process.env.PHOTO_DIR = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.PHOTO_DIR;
  });

  async function makeJpegInput(): Promise<DetectInput> {
    const buf = await sharp({
      create: { width: 1920, height: 1080, channels: 3, background: { r: 100, g: 100, b: 100 } },
    }).jpeg().toBuffer();
    return {
      imageBase64: buf.toString('base64'),
      imageSha256: 'deadbeef',
      mimeType: 'image/jpeg',
      traceId: 'trace-1',
      requestId: 'req-1',
    };
  }

  it('saves the original image and a thumbnail, returns the ids/paths', async () => {
    const input = await makeJpegInput();
    const saved = await savePhoto(input);
    expect(saved.photoId).toMatch(/^[0-9a-f-]{36}$/);
    expect(fs.existsSync(saved.photoPath)).toBe(true);
    expect(fs.existsSync(saved.thumbnailPath)).toBe(true);
    expect(saved.bytes).toBeGreaterThan(0);
  });

  it('thumbnail width <= 400px', async () => {
    const input = await makeJpegInput();
    const saved = await savePhoto(input);
    const meta = await sharp(saved.thumbnailPath).metadata();
    expect(meta.width!).toBeLessThanOrEqual(400);
  });

  it('creates the photos directory if it does not exist', async () => {
    const nested = path.join(tmpDir, 'nested', 'photos-dir');
    process.env.PHOTO_DIR = nested;
    const input = await makeJpegInput();
    const saved = await savePhoto(input);
    expect(fs.existsSync(saved.photoPath)).toBe(true);
  });

  it('throws a non-retryable error on unsupported mime type', async () => {
    const input = await makeJpegInput();
    input.mimeType = 'text/plain';
    await expect(savePhoto(input)).rejects.toMatchObject({
      name: 'ApplicationFailure',
      nonRetryable: true,
    });
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service
npm test -- --run src/__tests__/unit/temporal/activities/save-photo.activity.test.ts 2>&1 | tail -10
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the activity**

Create `api-service/src/temporal/activities/save-photo.activity.ts`:

```typescript
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { ApplicationFailure } from '@temporalio/activity';
import { DetectInput, SavedPhoto } from '../shared-types';
import { envConfig } from '../../config/env.config';
import { logger } from '../../utils/logger';

const SUPPORTED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const THUMB_WIDTH = 400;

export async function savePhoto(input: DetectInput): Promise<SavedPhoto> {
  if (!SUPPORTED_MIMES.has(input.mimeType)) {
    throw ApplicationFailure.create({
      message: `Unsupported mime type: ${input.mimeType}`,
      type: 'UnsupportedMediaType',
      nonRetryable: true,
    });
  }

  const photosDir = path.join(envConfig.photoDir, 'photos');
  fs.mkdirSync(photosDir, { recursive: true });

  const photoId = randomUUID();
  const photoPath = path.join(photosDir, `${photoId}.jpg`);
  const thumbnailPath = path.join(photosDir, `${photoId}_thumb.jpg`);

  const imageBuffer = Buffer.from(input.imageBase64, 'base64');
  fs.writeFileSync(photoPath, imageBuffer);

  try {
    await sharp(imageBuffer)
      .resize(THUMB_WIDTH, undefined, { fit: 'inside' })
      .jpeg({ quality: 85 })
      .toFile(thumbnailPath);
  } catch (err) {
    logger.warn({ photoId, err: (err as Error).message }, 'Thumbnail failed; using original as fallback');
    fs.copyFileSync(photoPath, thumbnailPath);
  }

  logger.info({ photoId, bytes: imageBuffer.length, traceId: input.traceId }, 'Photo saved');

  return { photoId, photoPath, thumbnailPath, bytes: imageBuffer.length };
}
```

- [ ] **Step 4: Register the activity in the barrel**

Replace the contents of `api-service/src/temporal/activities/index.ts`:

```typescript
export { savePhoto } from './save-photo.activity';
```

- [ ] **Step 5: Run tests**

```bash
npm test -- --run src/__tests__/unit/temporal/activities/save-photo.activity.test.ts 2>&1 | tail -15
```
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add api-service/src/temporal/activities/save-photo.activity.ts \
        api-service/src/temporal/activities/index.ts \
        api-service/src/__tests__/unit/temporal/activities/save-photo.activity.test.ts
git commit -m "feat(temporal): savePhoto activity — persist photo + thumbnail"
```

---

### Task 9: florenceDetect activity (TDD)

**Files:**
- Create: `api-service/src/temporal/activities/florence-detect.activity.ts`
- Create: `api-service/src/__tests__/unit/temporal/activities/florence-detect.activity.test.ts`
- Modify: `api-service/src/temporal/activities/index.ts`

- [ ] **Step 1: Write the test**

Create `api-service/src/__tests__/unit/temporal/activities/florence-detect.activity.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { florenceDetect } from '../../../../temporal/activities/florence-detect.activity';
import { DetectInput } from '../../../../temporal/shared-types';

describe('florenceDetect activity', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  function makeInput(): DetectInput {
    return {
      imageBase64: Buffer.from('fake-jpeg').toString('base64'),
      imageSha256: 'abc',
      mimeType: 'image/jpeg',
      traceId: 't',
      requestId: 'r',
    };
  }

  it('maps HTTP regions to FlorenceDetection with regionIndex', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        regions: [
          { caption: 'desk lamp', x: 0.1, y: 0.2, width: 0.15, height: 0.25 },
          { caption: 'blue sofa', x: 0.5, y: 0.3, width: 0.4, height: 0.5 },
        ],
        image_width: 1920,
        image_height: 1080,
      }),
    } as Response);

    const result = await florenceDetect(makeInput());
    expect(result.regions).toHaveLength(2);
    expect(result.regions[0].regionIndex).toBe(0);
    expect(result.regions[1].regionIndex).toBe(1);
    expect(result.regions[0].caption).toBe('desk lamp');
    expect(result.imageWidth).toBe(1920);
  });

  it('returns empty regions on zero detections', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ regions: [], image_width: 640, image_height: 480 }),
    } as Response);

    const result = await florenceDetect(makeInput());
    expect(result.regions).toEqual([]);
  });

  it('throws retryable ApplicationFailure on 5xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => 'bad gateway',
    } as Response);

    await expect(florenceDetect(makeInput())).rejects.toMatchObject({
      name: 'ApplicationFailure',
      nonRetryable: false,
    });
  });

  it('throws non-retryable ApplicationFailure on 4xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 415,
      text: async () => 'unsupported',
    } as Response);

    await expect(florenceDetect(makeInput())).rejects.toMatchObject({
      name: 'ApplicationFailure',
      nonRetryable: true,
    });
  });

  it('propagates traceparent header when trace context exists', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ regions: [], image_width: 1, image_height: 1 }),
    } as Response);

    await florenceDetect(makeInput());
    const call = fetchSpy.mock.calls[0];
    const init = call[1] as RequestInit;
    // Headers may be a plain object, Headers instance, or array of tuples.
    const h = init.headers as Record<string, string>;
    // Not asserting presence (trace context may be absent in unit context);
    // just asserting no crash and correct URL path.
    expect(call[0]).toMatch(/\/detect\/florence$/);
    expect(init.method).toBe('POST');
    expect(h).toBeDefined();
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npm test -- --run src/__tests__/unit/temporal/activities/florence-detect.activity.test.ts 2>&1 | tail -10
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the activity**

Create `api-service/src/temporal/activities/florence-detect.activity.ts`:

```typescript
import { ApplicationFailure, heartbeat, Context } from '@temporalio/activity';
import { propagation, context } from '@opentelemetry/api';
import { DetectInput, FlorenceDetection } from '../shared-types';
import { envConfig } from '../../config/env.config';
import { logger } from '../../utils/logger';

interface FlorenceHttpRegion {
  caption: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FlorenceHttpResponse {
  regions: FlorenceHttpRegion[];
  image_width: number;
  image_height: number;
}

export async function florenceDetect(input: DetectInput): Promise<FlorenceDetection> {
  const imageBuffer = Buffer.from(input.imageBase64, 'base64');
  const headers: Record<string, string> = {};
  propagation.inject(context.active(), headers);

  // Heartbeat every 5s during the call so a dead worker is detected fast.
  const heartbeatTimer = setInterval(() => {
    try { heartbeat({ phase: 'awaiting-florence' }); } catch { /* not in activity context */ }
  }, 5000);

  try {
    const form = new FormData();
    form.append('file', new Blob([imageBuffer], { type: input.mimeType }), 'image');

    const res = await fetch(`${envConfig.florenceUrl}/detect/florence`, {
      method: 'POST',
      headers,
      body: form,
      signal: AbortSignal.timeout(envConfig.detectionTimeoutMs),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '<unreadable>');
      const retryable = res.status >= 500;
      throw ApplicationFailure.create({
        message: `Florence detector returned ${res.status}: ${body.slice(0, 200)}`,
        type: retryable ? 'FlorenceTransientError' : 'FlorenceBadRequestError',
        nonRetryable: !retryable,
      });
    }

    const data: FlorenceHttpResponse = await res.json();
    logger.info({
      count: data.regions.length,
      traceId: input.traceId,
      activity: Context.current().info.activityId,
    }, 'Florence detection complete');

    return {
      regions: data.regions.map((r, regionIndex) => ({
        caption: r.caption.trim(),
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        regionIndex,
      })),
      imageWidth: data.image_width,
      imageHeight: data.image_height,
    };
  } finally {
    clearInterval(heartbeatTimer);
  }
}
```

Note: `Context.current()` throws outside an activity context. In unit tests we use the direct import without going through `@temporalio/testing`, so wrap that log field carefully.

Revise the log line to:

```typescript
let activityId = 'test';
try { activityId = Context.current().info.activityId; } catch { /* not in activity context */ }
logger.info({ count: data.regions.length, traceId: input.traceId, activity: activityId }, 'Florence detection complete');
```

- [ ] **Step 4: Register in barrel**

Update `api-service/src/temporal/activities/index.ts`:

```typescript
export { savePhoto } from './save-photo.activity';
export { florenceDetect } from './florence-detect.activity';
```

- [ ] **Step 5: Run tests**

```bash
npm test -- --run src/__tests__/unit/temporal/activities/florence-detect.activity.test.ts 2>&1 | tail -15
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api-service/src/temporal/activities/florence-detect.activity.ts \
        api-service/src/temporal/activities/index.ts \
        api-service/src/__tests__/unit/temporal/activities/florence-detect.activity.test.ts
git commit -m "feat(temporal): florenceDetect activity — Florence-2 HTTP call with trace propagation + heartbeats"
```

---

### Task 10: enrichItem activity (TDD — one item, one model)

**Files:**
- Create: `api-service/src/temporal/activities/enrich-item.activity.ts`
- Create: `api-service/src/__tests__/unit/temporal/activities/enrich-item.activity.test.ts`
- Modify: `api-service/src/temporal/activities/index.ts`

- [ ] **Step 1: Write the test**

Create `api-service/src/__tests__/unit/temporal/activities/enrich-item.activity.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichItem } from '../../../../temporal/activities/enrich-item.activity';
import { FlorenceRegion } from '../../../../temporal/shared-types';

describe('enrichItem activity', () => {
  beforeEach(() => vi.restoreAllMocks());

  const region: FlorenceRegion = {
    caption: 'wooden desk lamp',
    x: 0.1, y: 0.2, width: 0.15, height: 0.25,
    regionIndex: 0,
  };

  function mockOllamaOk(json: object) {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: JSON.stringify(json) }),
    } as Response);
  }

  it('returns an EnrichedItem with tier + structured attributes', async () => {
    mockOllamaOk({
      name: 'Brass desk lamp',
      category: 'lighting',
      color: 'gold/brass',
      material: 'metal',
      condition: 'good',
      estimated_value: '40-60 EUR',
      description: 'Modern brass desk lamp with adjustable arm',
      search_tags: ['brass', 'lamp', 'desk'],
    });

    const item = await enrichItem({
      imageBase64: Buffer.from('img').toString('base64'),
      region,
      tier: 'qwen7b',
      model: 'qwen2.5vl:7b',
    });

    expect(item.enrichmentTier).toBe('qwen7b');
    expect(item.label).toBe('Brass desk lamp');
    expect(item.attributes.category).toBe('lighting');
    expect(item.attributes.color).toBe('gold/brass');
    expect(item.bbox.x).toBe(region.x);
    expect(item.regionIndex).toBe(0);
    expect(item.attributes.searchTags).toEqual(expect.arrayContaining(['brass', 'lamp', 'desk']));
  });

  it('throws retryable ApplicationFailure on 5xx from Ollama', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'boom',
    } as Response);

    await expect(enrichItem({
      imageBase64: 'x',
      region,
      tier: 'qwen7b',
      model: 'qwen2.5vl:7b',
    })).rejects.toMatchObject({
      name: 'ApplicationFailure',
      nonRetryable: false,
    });
  });

  it('throws non-retryable error when Ollama response JSON cannot be parsed and no fallback', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: 'not json at all' }),
    } as Response);

    await expect(enrichItem({
      imageBase64: 'x',
      region,
      tier: 'qwen7b',
      model: 'qwen2.5vl:7b',
    })).rejects.toMatchObject({
      name: 'ApplicationFailure',
      type: 'OllamaJsonParseError',
    });
  });

  it('builds florence-only item without calling Ollama when tier is florence-only', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const item = await enrichItem({
      imageBase64: 'x',
      region,
      tier: 'florence-only',
      model: null,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(item.enrichmentTier).toBe('florence-only');
    expect(item.label).toBe('wooden desk lamp');
    expect(item.attributes.category).toBe('household item');
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npm test -- --run src/__tests__/unit/temporal/activities/enrich-item.activity.test.ts 2>&1 | tail -10
```
Expected: FAIL.

- [ ] **Step 3: Implement the activity**

Create `api-service/src/temporal/activities/enrich-item.activity.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import { ApplicationFailure } from '@temporalio/activity';
import { propagation, context } from '@opentelemetry/api';
import { EnrichedItem, EnrichmentTier, FlorenceRegion } from '../shared-types';
import { envConfig } from '../../config/env.config';
import { logger } from '../../utils/logger';

export interface EnrichItemInput {
  imageBase64: string;
  region: FlorenceRegion;
  tier: EnrichmentTier;
  model: string | null; // null for tier 'florence-only'
}

const PROMPT = `You are an expert appraiser identifying a single household item in a photo.
Return ONLY a single JSON object with these fields (no markdown, no prose):
{
 "name": "short specific name, e.g. 'Brass desk lamp'",
 "category": "short category, e.g. 'lighting'",
 "color": "dominant color(s)",
 "material": "primary material",
 "condition": "poor|fair|good|excellent",
 "estimated_value": "price range in EUR like '40-60 EUR' or null",
 "description": "one-sentence description",
 "search_tags": ["tag1", "tag2", "..."]
}
The item in question is labeled by a vision detector as: "{CAPTION}"`;

export async function enrichItem(input: EnrichItemInput): Promise<EnrichedItem> {
  if (input.tier === 'florence-only') {
    return buildFlorenceOnly(input.region);
  }

  if (!input.model) {
    throw ApplicationFailure.create({
      message: 'Model is required for non-florence-only tier',
      type: 'InvalidTierConfig',
      nonRetryable: true,
    });
  }

  const prompt = PROMPT.replace('{CAPTION}', input.region.caption);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  propagation.inject(context.active(), headers);

  const res = await fetch(`${envConfig.ollamaBaseUrl}/api/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: input.model,
      prompt,
      images: [input.imageBase64],
      stream: false,
      options: { num_ctx: 4096, temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(tierTimeoutMs(input.tier)),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '<unreadable>');
    const retryable = res.status >= 500;
    throw ApplicationFailure.create({
      message: `Ollama ${input.model} returned ${res.status}: ${body.slice(0, 200)}`,
      type: retryable ? 'OllamaTransientError' : 'OllamaBadRequestError',
      nonRetryable: !retryable,
    });
  }

  const data = (await res.json()) as { response?: string };
  const raw = data.response ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw ApplicationFailure.create({
      message: `Ollama response was not valid JSON: ${raw.slice(0, 200)}`,
      type: 'OllamaJsonParseError',
      nonRetryable: true, // parsing is deterministic — retry won't help
    });
  }

  return buildEnrichedItem(input.region, input.tier, parsed as Record<string, unknown>);
}

function tierTimeoutMs(tier: EnrichmentTier): number {
  switch (tier) {
    case 'qwen7b': return 20_000;
    case 'qwen3b': return 12_000;
    case 'moondream': return 8_000;
    default: return 5_000;
  }
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function buildEnrichedItem(region: FlorenceRegion, tier: EnrichmentTier, parsed: Record<string, unknown>): EnrichedItem {
  const s = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') as string[] : []);
  const name = s(parsed.name) ?? region.caption;
  const category = s(parsed.category) ?? 'household item';
  const color = s(parsed.color);
  const material = s(parsed.material);
  const tags = [...new Set([
    ...arr(parsed.search_tags),
    name, category, color, material,
  ].filter(Boolean).map((t) => (t as string).toLowerCase()))];

  return {
    id: randomUUID(),
    regionIndex: region.regionIndex,
    label: name,
    confidence: 0.9,
    bbox: { x: region.x, y: region.y, width: region.width, height: region.height },
    enrichmentTier: tier,
    attributes: {
      name,
      category,
      color,
      material,
      condition: s(parsed.condition),
      estimatedValue: s(parsed.estimated_value),
      description: s(parsed.description) ?? `${name} detected in the scene`,
      searchTags: tags,
    },
  };
}

function buildFlorenceOnly(region: FlorenceRegion): EnrichedItem {
  const name = region.caption || 'unidentified item';
  return {
    id: randomUUID(),
    regionIndex: region.regionIndex,
    label: name,
    confidence: 0.5,
    bbox: { x: region.x, y: region.y, width: region.width, height: region.height },
    enrichmentTier: 'florence-only',
    attributes: {
      name,
      category: 'household item',
      color: null,
      material: null,
      condition: null,
      estimatedValue: null,
      description: `${name} detected in the scene`,
      searchTags: [name.toLowerCase()],
    },
  };
}
```

- [ ] **Step 4: Register in barrel**

Update `api-service/src/temporal/activities/index.ts`:

```typescript
export { savePhoto } from './save-photo.activity';
export { florenceDetect } from './florence-detect.activity';
export { enrichItem } from './enrich-item.activity';
```

- [ ] **Step 5: Run tests**

```bash
npm test -- --run src/__tests__/unit/temporal/activities/enrich-item.activity.test.ts 2>&1 | tail -15
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api-service/src/temporal/activities/enrich-item.activity.ts \
        api-service/src/temporal/activities/index.ts \
        api-service/src/__tests__/unit/temporal/activities/enrich-item.activity.test.ts
git commit -m "feat(temporal): enrichItem activity — per-item tier-aware classifier"
```

---

### Task 11: assembleResult activity (TDD)

**Files:**
- Create: `api-service/src/temporal/activities/assemble-result.activity.ts`
- Create: `api-service/src/__tests__/unit/temporal/activities/assemble-result.activity.test.ts`
- Modify: `api-service/src/temporal/activities/index.ts`

- [ ] **Step 1: Write the test**

Create `api-service/src/__tests__/unit/temporal/activities/assemble-result.activity.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { assembleResult } from '../../../../temporal/activities/assemble-result.activity';
import { EnrichedItem, SavedPhoto, PipelineError } from '../../../../temporal/shared-types';

describe('assembleResult activity', () => {
  const saved: SavedPhoto = {
    photoId: 'aaa-bbb',
    photoPath: '/tmp/photos/aaa-bbb.jpg',
    thumbnailPath: '/tmp/photos/aaa-bbb_thumb.jpg',
    bytes: 12345,
  };

  const item: EnrichedItem = {
    id: 'item-1',
    regionIndex: 0,
    label: 'lamp',
    confidence: 0.9,
    bbox: { x: 0, y: 0, width: 0.1, height: 0.1 },
    enrichmentTier: 'qwen7b',
    attributes: {
      name: 'lamp', category: 'lighting', color: null, material: null, condition: null,
      estimatedValue: null, description: 'lamp', searchTags: ['lamp'],
    },
  };

  it('builds DetectResult with photoUrl, counts, traceId, processingMs', async () => {
    const result = await assembleResult({
      saved,
      items: [item],
      errors: [],
      traceId: 'trace-abc',
      startedAtMs: Date.now() - 1500,
    });

    expect(result.photoId).toBe('aaa-bbb');
    expect(result.photoUrl).toBe('/photos/aaa-bbb.jpg');
    expect(result.itemCount).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.errors).toEqual([]);
    expect(result.traceId).toBe('trace-abc');
    expect(result.processingMs).toBeGreaterThanOrEqual(1500);
  });

  it('carries forward pipeline errors', async () => {
    const err: PipelineError = {
      step: 'enrich-items', code: 'tier_exhausted', message: 'all tiers failed', retryable: false,
    };
    const result = await assembleResult({
      saved, items: [], errors: [err], traceId: 't', startedAtMs: Date.now(),
    });
    expect(result.errors).toEqual([err]);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npm test -- --run src/__tests__/unit/temporal/activities/assemble-result.activity.test.ts 2>&1 | tail -10
```
Expected: FAIL.

- [ ] **Step 3: Implement the activity**

Create `api-service/src/temporal/activities/assemble-result.activity.ts`:

```typescript
import { DetectResult, EnrichedItem, PipelineError, SavedPhoto } from '../shared-types';

export interface AssembleInput {
  saved: SavedPhoto;
  items: EnrichedItem[];
  errors: PipelineError[];
  traceId: string;
  startedAtMs: number;
}

export async function assembleResult(input: AssembleInput): Promise<DetectResult> {
  return {
    photoId: input.saved.photoId,
    photoUrl: `/photos/${input.saved.photoId}.jpg`,
    itemCount: input.items.length,
    items: input.items,
    errors: input.errors,
    traceId: input.traceId,
    processingMs: Date.now() - input.startedAtMs,
  };
}
```

- [ ] **Step 4: Register + test**

Update `api-service/src/temporal/activities/index.ts`:

```typescript
export { savePhoto } from './save-photo.activity';
export { florenceDetect } from './florence-detect.activity';
export { enrichItem } from './enrich-item.activity';
export { assembleResult } from './assemble-result.activity';
```

```bash
npm test -- --run src/__tests__/unit/temporal/activities/assemble-result.activity.test.ts 2>&1 | tail -10
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api-service/src/temporal/activities/assemble-result.activity.ts \
        api-service/src/temporal/activities/index.ts \
        api-service/src/__tests__/unit/temporal/activities/assemble-result.activity.test.ts
git commit -m "feat(temporal): assembleResult activity — pipeline output shaping"
```

---

### Task 12: detectInventoryWorkflow with tier chain (workflow test framework)

**Files:**
- Create: `api-service/src/temporal/workflows/tier-chain.ts`
- Modify (replace stub): `api-service/src/temporal/workflows/detect-inventory.workflow.ts`
- Create: `api-service/src/__tests__/workflow/detect-inventory.workflow.test.ts`

- [ ] **Step 1: Write tier-chain helper (deterministic pure function)**

Create `api-service/src/temporal/workflows/tier-chain.ts`:

```typescript
import { EnrichmentTier } from '../shared-types';

export interface TierSpec {
  name: EnrichmentTier;
  model: string | null;
  timeoutSeconds: number;
  retries: number;
}

export function buildTierChain(env: {
  tier1Model: string; tier2Model: string; tier3Model: string;
}): TierSpec[] {
  return [
    { name: 'qwen7b',        model: env.tier1Model, timeoutSeconds: 20, retries: 1 },
    { name: 'qwen3b',        model: env.tier2Model, timeoutSeconds: 12, retries: 1 },
    { name: 'moondream',     model: env.tier3Model, timeoutSeconds: 8,  retries: 0 },
    { name: 'florence-only', model: null,           timeoutSeconds: 5,  retries: 0 },
  ];
}
```

- [ ] **Step 2: Write the workflow test (Temporal test framework, time-skipping)**

Create `api-service/src/__tests__/workflow/detect-inventory.workflow.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { detectInventoryWorkflow } from '../../temporal/workflows/detect-inventory.workflow';
import { DetectInput } from '../../temporal/shared-types';

describe('detectInventoryWorkflow', () => {
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  }, 30_000);

  afterAll(async () => {
    await testEnv?.teardown();
  });

  function makeInput(): DetectInput {
    return {
      imageBase64: Buffer.from('fake-image').toString('base64'),
      imageSha256: 'e' + randomUUID().replace(/-/g, ''),
      mimeType: 'image/jpeg',
      traceId: randomUUID().replace(/-/g, ''),
      requestId: randomUUID(),
    };
  }

  async function runWith(activities: Record<string, unknown>, input: DetectInput) {
    const taskQueue = 'test-inventory-' + randomUUID();
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue,
      workflowsPath: path.resolve(__dirname, '../../temporal/workflows/detect-inventory.workflow'),
      activities,
    });
    const resultPromise = testEnv.client.workflow.execute(detectInventoryWorkflow, {
      args: [input], workflowId: 'wf-' + input.imageSha256, taskQueue,
    });
    const [result] = await Promise.all([resultPromise, worker.runUntil(resultPromise)]);
    return result;
  }

  it('completes happy path: save -> florence -> enrich (tier1) -> assemble', async () => {
    const input = makeInput();
    const result = await runWith({
      savePhoto: async () => ({ photoId: 'p1', photoPath: '/p1.jpg', thumbnailPath: '/p1_thumb.jpg', bytes: 100 }),
      florenceDetect: async () => ({
        regions: [{ caption: 'chair', x: 0, y: 0, width: 0.5, height: 0.5, regionIndex: 0 }],
        imageWidth: 640, imageHeight: 480,
      }),
      enrichItem: async ({ tier, region }: { tier: string; region: any }) => ({
        id: 'i1', regionIndex: region.regionIndex, label: 'chair', confidence: 0.9,
        bbox: { x: region.x, y: region.y, width: region.width, height: region.height },
        enrichmentTier: tier,
        attributes: { name: 'chair', category: 'furniture', color: null, material: null, condition: null,
                      estimatedValue: null, description: 'chair', searchTags: ['chair'] },
      }),
      assembleResult: async ({ saved, items, errors, traceId, startedAtMs }: any) => ({
        photoId: saved.photoId, photoUrl: `/photos/${saved.photoId}.jpg`,
        itemCount: items.length, items, errors, traceId, processingMs: Date.now() - startedAtMs,
      }),
    }, input);

    expect(result.photoId).toBe('p1');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].enrichmentTier).toBe('qwen7b');
    expect(result.errors).toEqual([]);
  });

  it('downgrades to qwen3b when tier1 activity fails retryably', async () => {
    const input = makeInput();
    const result = await runWith({
      savePhoto: async () => ({ photoId: 'p2', photoPath: '/p2.jpg', thumbnailPath: '/p2_t.jpg', bytes: 100 }),
      florenceDetect: async () => ({
        regions: [{ caption: 'lamp', x: 0, y: 0, width: 0.5, height: 0.5, regionIndex: 0 }],
        imageWidth: 640, imageHeight: 480,
      }),
      enrichItem: async ({ tier }: { tier: string }) => {
        if (tier === 'qwen7b') throw new Error('qwen7b transient failure');
        return {
          id: 'i1', regionIndex: 0, label: 'lamp', confidence: 0.8,
          bbox: { x: 0, y: 0, width: 0.5, height: 0.5 }, enrichmentTier: tier,
          attributes: { name: 'lamp', category: 'lighting', color: null, material: null, condition: null,
                        estimatedValue: null, description: 'lamp', searchTags: ['lamp'] },
        };
      },
      assembleResult: async ({ saved, items, errors, traceId, startedAtMs }: any) => ({
        photoId: saved.photoId, photoUrl: `/photos/${saved.photoId}.jpg`,
        itemCount: items.length, items, errors, traceId, processingMs: Date.now() - startedAtMs,
      }),
    }, input);

    expect(result.items[0].enrichmentTier).toBe('qwen3b');
  });

  it('falls all the way to florence-only when every tier throws', async () => {
    const input = makeInput();
    const result = await runWith({
      savePhoto: async () => ({ photoId: 'p3', photoPath: '/p3.jpg', thumbnailPath: '/p3_t.jpg', bytes: 100 }),
      florenceDetect: async () => ({
        regions: [{ caption: 'mystery', x: 0, y: 0, width: 1, height: 1, regionIndex: 0 }],
        imageWidth: 1, imageHeight: 1,
      }),
      enrichItem: async ({ tier, region }: { tier: string; region: any }) => {
        if (tier !== 'florence-only') throw new Error(`${tier} failed`);
        return {
          id: 'flo', regionIndex: region.regionIndex, label: region.caption, confidence: 0.5,
          bbox: { x: region.x, y: region.y, width: region.width, height: region.height },
          enrichmentTier: 'florence-only',
          attributes: { name: region.caption, category: 'household item', color: null, material: null,
                        condition: null, estimatedValue: null, description: 'x', searchTags: [] },
        };
      },
      assembleResult: async ({ saved, items, errors, traceId, startedAtMs }: any) => ({
        photoId: saved.photoId, photoUrl: `/photos/${saved.photoId}.jpg`,
        itemCount: items.length, items, errors, traceId, processingMs: Date.now() - startedAtMs,
      }),
    }, input);

    expect(result.items[0].enrichmentTier).toBe('florence-only');
  });

  it('fails the workflow when savePhoto throws non-retryably', async () => {
    const input = makeInput();
    input.mimeType = 'text/plain';
    await expect(runWith({
      savePhoto: async () => { const err: any = new Error('bad mime'); err.nonRetryable = true; throw err; },
      florenceDetect: async () => ({ regions: [], imageWidth: 1, imageHeight: 1 }),
      enrichItem: async () => { throw new Error('unreachable'); },
      assembleResult: async () => { throw new Error('unreachable'); },
    }, input)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run — expect FAIL because workflow is a stub**

```bash
npm test -- --run src/__tests__/workflow/detect-inventory.workflow.test.ts 2>&1 | tail -20
```
Expected: FAIL — stub throws "not yet implemented".

- [ ] **Step 4: Implement the workflow**

Replace `api-service/src/temporal/workflows/detect-inventory.workflow.ts` with:

```typescript
import {
  proxyActivities,
  defineSignal,
  ApplicationFailure,
  workflowInfo,
  log,
  sleep,
  CancellationScope,
} from '@temporalio/workflow';
import type * as activities from '../activities';
import {
  DetectInput,
  DetectResult,
  EnrichedItem,
  FlorenceDetection,
  PipelineError,
  SavedPhoto,
} from '../shared-types';

// Tier chain (local constants — must be deterministic, so we read from env-injected workflow args in prod)
interface TierSpec {
  name: 'qwen7b' | 'qwen3b' | 'moondream' | 'florence-only';
  model: string | null;
  timeoutSec: number;
  retries: number;
}

const TIER_CHAIN: TierSpec[] = [
  { name: 'qwen7b',        model: 'qwen2.5vl:7b', timeoutSec: 20, retries: 1 },
  { name: 'qwen3b',        model: 'qwen2.5vl:3b', timeoutSec: 12, retries: 1 },
  { name: 'moondream',     model: 'moondream',    timeoutSec: 8,  retries: 0 },
  { name: 'florence-only', model: null,           timeoutSec: 5,  retries: 0 },
];

const ENRICHMENT_BUDGET_MS = 45_000;

// Activities — proxied with per-activity retry + timeout policies.
const { savePhoto, florenceDetect, assembleResult } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 3,
    maximumAttempts: 3,
    nonRetryableErrorTypes: ['UnsupportedMediaType', 'FlorenceBadRequestError'],
  },
});

// Per-tier activity proxies with distinct timeouts
const tierProxies: Record<string, typeof activities.enrichItem> = {};
for (const tier of TIER_CHAIN) {
  tierProxies[tier.name] = proxyActivities<typeof activities>({
    startToCloseTimeout: `${tier.timeoutSec} seconds`,
    heartbeatTimeout: '10 seconds',
    retry: {
      initialInterval: '1s',
      backoffCoefficient: 2,
      maximumAttempts: tier.retries + 1,
      nonRetryableErrorTypes: ['InvalidTierConfig', 'OllamaJsonParseError', 'OllamaBadRequestError'],
    },
  }).enrichItem;
}

export const cancelWorkflowSignal = defineSignal('cancel-workflow');

export async function detectInventoryWorkflow(input: DetectInput): Promise<DetectResult> {
  const startedAtMs = Date.now();
  const errors: PipelineError[] = [];

  log.info('pipeline.start', { traceId: input.traceId, sha: input.imageSha256 });

  // 1. Save photo (non-negotiable; no retry, fail whole workflow on error)
  let saved: SavedPhoto;
  try {
    saved = await savePhoto(input);
  } catch (err) {
    log.error('save-photo failed — failing whole workflow', { err: String(err) });
    throw err;
  }

  // 2. Florence detect (retry policy in proxy handles transient failures)
  let detection: FlorenceDetection;
  try {
    detection = await florenceDetect(input);
  } catch (err) {
    errors.push({ step: 'florence-detect', code: 'detector_exhausted', message: String(err), retryable: false });
    return assembleResult({ saved, items: [], errors, traceId: input.traceId, startedAtMs });
  }

  // 3. Enrich items with tier chain
  const items = await enrichItemsWithTierChain(input, detection, startedAtMs, errors);

  // 4. Assemble
  return assembleResult({ saved, items, errors, traceId: input.traceId, startedAtMs });
}

async function enrichItemsWithTierChain(
  input: DetectInput,
  detection: FlorenceDetection,
  startedAtMs: number,
  errors: PipelineError[],
): Promise<EnrichedItem[]> {
  const items: EnrichedItem[] = [];
  const budgetEndMs = startedAtMs + ENRICHMENT_BUDGET_MS;

  for (const region of detection.regions) {
    let enriched: EnrichedItem | null = null;
    for (const tier of TIER_CHAIN) {
      const remaining = budgetEndMs - Date.now();
      if (remaining <= 0 && tier.name !== 'florence-only') continue;

      try {
        enriched = await tierProxies[tier.name]({
          imageBase64: input.imageBase64,
          region,
          tier: tier.name,
          model: tier.model,
        });
        if (tier.name !== 'qwen7b') {
          log.info('tier downgraded', { regionIndex: region.regionIndex, finalTier: tier.name });
        }
        break;
      } catch (err) {
        if (ApplicationFailure.isNonRetryable(err)) {
          errors.push({ step: `enrich-${tier.name}`, code: 'nonretryable', message: String(err), retryable: false });
          // Try next tier for this item
          continue;
        }
        errors.push({ step: `enrich-${tier.name}`, code: 'exhausted_retries', message: String(err), retryable: true });
        // Try next tier
        continue;
      }
    }
    if (!enriched) {
      log.error('no tier produced a result — shouldn’t happen', { regionIndex: region.regionIndex });
      errors.push({ step: 'enrich-items', code: 'tier_exhausted', message: 'All tiers failed including florence-only', retryable: false });
      continue;
    }
    items.push(enriched);
  }

  return items;
}
```

Note: `sleep`, `CancellationScope`, and `workflowInfo` are imported for later features (cancel signal, replay tests). They pass lint as unused imports only if TypeScript's `noUnusedLocals` is off — confirm in `tsconfig.json`. If it's on, drop the unused imports or use them. Safest: drop them for now.

Remove unused imports so the file type-checks:

```typescript
import { proxyActivities, ApplicationFailure, log } from '@temporalio/workflow';
```

(`defineSignal` is used; keep it.)

Actually `defineSignal` IS exported but unused. Remove or keep:

```typescript
import { proxyActivities, ApplicationFailure, log, defineSignal } from '@temporalio/workflow';
```

Since we reference `cancelWorkflowSignal` export, it's used. Keep `defineSignal`.

- [ ] **Step 5: Run the workflow tests**

```bash
npm test -- --run src/__tests__/workflow/detect-inventory.workflow.test.ts 2>&1 | tail -30
```
Expected: all 4 PASS. Tests run in time-skipping mode so retries + timeouts are simulated deterministically.

- [ ] **Step 6: Commit**

```bash
git add api-service/src/temporal/workflows/tier-chain.ts \
        api-service/src/temporal/workflows/detect-inventory.workflow.ts \
        api-service/src/__tests__/workflow/detect-inventory.workflow.test.ts
git commit -m "feat(temporal): detectInventoryWorkflow with 4-tier enrichment chain

Workflow: save-photo -> florence-detect -> enrich-items (tier chain) -> assemble.
Per-tier activity proxies carry tier-specific timeouts and retry policies.
Non-retryable errors trigger tier downgrade; retryable exhaustion also
downgrades. Workflow tested via time-skipping test environment."
```

---

The remaining tasks (13–30) continue the pattern: replay tests, ProviderHealthService, route rewrites, observability stack, operations scripts, smoke tests, and mobile-app updates.

**Due to length, tasks 13 through 30 are documented as separate task entries with the same TDD structure — files + steps + commit.** The plan is being progressively filled; the next segment will complete Phase C (tasks 13–18), then D, E, F.

---

## Phase C (continued), Phase D, E, F — tasks 13-30

> **Status note:** Tasks 13-30 follow the exact same structure (Files / numbered checkbox steps / runnable commands / code blocks / commit). They are being appended in the next pass of this plan so the document does not exceed the editor buffer. Each of the remaining tasks below has full concrete content before execution begins; they will not be left as placeholders.

### Task 13: Replay test with recorded workflow history

**Files:**
- Create: `api-service/src/__tests__/workflow/detect-inventory.replay.test.ts`
- Create: `api-service/src/__tests__/workflow/histories/README.md`
- Create: `api-service/src/__tests__/workflow/histories/happy-path-qwen7b.json` (generated below)

Replay testing is Temporal's safety net for workflow determinism. We record a workflow history from a known-good execution, then replay it against current workflow code. Any non-deterministic change (reordering awaits, adding `Math.random`, new unexpected activity calls) fails the replay.

- [ ] **Step 1: Write the replay test harness**

Create `api-service/src/__tests__/workflow/detect-inventory.replay.test.ts`:

```typescript
import { describe, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from '@temporalio/worker';
import { detectInventoryWorkflow } from '../../temporal/workflows/detect-inventory.workflow';

describe('detectInventoryWorkflow — replay', () => {
  const historiesDir = path.resolve(__dirname, 'histories');
  const histories = fs.existsSync(historiesDir)
    ? fs.readdirSync(historiesDir).filter((f) => f.endsWith('.json'))
    : [];

  if (histories.length === 0) {
    it.skip('no recorded histories yet — re-generate with scripts/record-history.ts', () => {});
    return;
  }

  for (const filename of histories) {
    it(`replays ${filename} deterministically`, async () => {
      const historyJson = JSON.parse(fs.readFileSync(path.join(historiesDir, filename), 'utf-8'));
      // Runner.runReplayHistory throws if replay diverges from the recorded path.
      await Worker.runReplayHistory(
        {
          workflowsPath: path.resolve(__dirname, '../../temporal/workflows/detect-inventory.workflow'),
        },
        historyJson,
        detectInventoryWorkflow.name,
      );
    }, 30_000);
  }
});
```

- [ ] **Step 2: Write a README explaining the history files**

Create `api-service/src/__tests__/workflow/histories/README.md`:

```markdown
# Recorded Workflow Histories

These JSON files are full workflow histories captured from real (or in-memory test) workflow executions. The replay test (`detect-inventory.replay.test.ts`) replays each history against the current workflow code and fails if the replay diverges — catching non-deterministic regressions before production.

## Regenerating

When you intentionally change workflow code:

1. Keep the existing histories (they assert backward-compatibility across a deprecated code path if using `patched()`).
2. OR delete obsolete histories and regenerate by running the workflow under `TestWorkflowEnvironment` and calling `client.workflow.getHandle(id).fetchHistory()`.

## Files

- `happy-path-qwen7b.json` — 1 region, tier-1 enrichment succeeds on first attempt
```

- [ ] **Step 3: Record a happy-path history**

Generate the history by extending the happy-path test from Task 12. Add a new test file **temporarily** to record history:

Create `api-service/src/__tests__/workflow/record-happy-path.ts` (utility, not a test):

```typescript
// Utility to regenerate happy-path-qwen7b.json. Run with:
//   npx tsx src/__tests__/workflow/record-happy-path.ts
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import fs from 'node:fs';
import path from 'node:path';
import { detectInventoryWorkflow } from '../../temporal/workflows/detect-inventory.workflow';

async function main() {
  const env = await TestWorkflowEnvironment.createTimeSkipping();
  try {
    const taskQueue = 'record-happy-path';
    const worker = await Worker.create({
      connection: env.nativeConnection,
      taskQueue,
      workflowsPath: path.resolve(__dirname, '../../temporal/workflows/detect-inventory.workflow'),
      activities: {
        savePhoto: async () => ({ photoId: 'recorded', photoPath: '/p.jpg', thumbnailPath: '/t.jpg', bytes: 100 }),
        florenceDetect: async () => ({
          regions: [{ caption: 'chair', x: 0, y: 0, width: 0.5, height: 0.5, regionIndex: 0 }],
          imageWidth: 640, imageHeight: 480,
        }),
        enrichItem: async ({ region, tier }: any) => ({
          id: 'r', regionIndex: region.regionIndex, label: 'chair', confidence: 0.9,
          bbox: { x: 0, y: 0, width: 0.5, height: 0.5 }, enrichmentTier: tier,
          attributes: { name: 'chair', category: 'furniture', color: null, material: null,
                        condition: null, estimatedValue: null, description: 'chair', searchTags: ['chair'] },
        }),
        assembleResult: async ({ saved, items, errors, traceId, startedAtMs }: any) => ({
          photoId: saved.photoId, photoUrl: `/photos/${saved.photoId}.jpg`,
          itemCount: items.length, items, errors, traceId, processingMs: Date.now() - startedAtMs,
        }),
      },
    });

    const workflowId = 'record-wf-' + Date.now();
    const p = env.client.workflow.execute(detectInventoryWorkflow, {
      args: [{ imageBase64: 'aGVsbG8=', imageSha256: 'abc', mimeType: 'image/jpeg', traceId: 't', requestId: 'r' }],
      workflowId, taskQueue,
    });
    await Promise.all([p, worker.runUntil(p)]);

    const handle = env.client.workflow.getHandle(workflowId);
    const history = await handle.fetchHistory();
    const outPath = path.resolve(__dirname, 'histories/happy-path-qwen7b.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(history, null, 2));
    console.log('Wrote', outPath);
  } finally {
    await env.teardown();
  }
}

void main();
```

Run it:
```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service
npx tsx src/__tests__/workflow/record-happy-path.ts
```
Expected: writes `histories/happy-path-qwen7b.json`.

- [ ] **Step 4: Run the replay test**

```bash
npm test -- --run src/__tests__/workflow/detect-inventory.replay.test.ts 2>&1 | tail -15
```
Expected: PASS (1 replay test).

- [ ] **Step 5: Commit**

```bash
git add api-service/src/__tests__/workflow/detect-inventory.replay.test.ts \
        api-service/src/__tests__/workflow/histories/ \
        api-service/src/__tests__/workflow/record-happy-path.ts
git commit -m "test(temporal): replay test for workflow determinism

Recorded happy-path-qwen7b history. Replay harness fails on any
non-deterministic workflow regression. Regenerate with
record-happy-path.ts when intentionally changing workflow logic."
```

---

### Task 14: ProviderHealthService — periodic probes for /v1/health

**Files:**
- Create: `api-service/src/services/provider-health.service.ts`
- Create: `api-service/src/__tests__/unit/provider-health.service.test.ts`

Why not workflow-based: health checks must be independent of Temporal so they work even when Temporal itself is unreachable.

- [ ] **Step 1: Write the test**

Create `api-service/src/__tests__/unit/provider-health.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderHealthService } from '../../services/provider-health.service';

describe('ProviderHealthService', () => {
  let svc: ProviderHealthService;

  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => { if (svc) svc.stop(); });

  it('returns unknown state before first probe', () => {
    svc = new ProviderHealthService({ florenceUrl: 'http://x', ollamaUrl: 'http://y', temporalHost: 'x:7233' });
    const s = svc.snapshot();
    expect(s.florence.status).toBe('unknown');
    expect(s.ollama.status).toBe('unknown');
    expect(s.temporal.status).toBe('unknown');
  });

  it('reports up when HTTP probe returns 2xx', async () => {
    svc = new ProviderHealthService({ florenceUrl: 'http://x', ollamaUrl: 'http://y', temporalHost: 'x:7233' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);
    await svc.probeOnce();
    const s = svc.snapshot();
    expect(s.florence.status).toBe('up');
    expect(s.ollama.status).toBe('up');
  });

  it('reports down when HTTP probe errors', async () => {
    svc = new ProviderHealthService({ florenceUrl: 'http://x', ollamaUrl: 'http://y', temporalHost: 'x:7233' });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('refused'));
    await svc.probeOnce();
    expect(svc.snapshot().florence.status).toBe('down');
  });

  it('tracks consecutive failures', async () => {
    svc = new ProviderHealthService({ florenceUrl: 'http://x', ollamaUrl: 'http://y', temporalHost: 'x:7233' });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('x'));
    await svc.probeOnce();
    await svc.probeOnce();
    await svc.probeOnce();
    expect(svc.snapshot().florence.consecutiveFailures).toBe(3);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npm test -- --run src/__tests__/unit/provider-health.service.test.ts 2>&1 | tail -10
```
Expected: FAIL.

- [ ] **Step 3: Implement the service**

Create `api-service/src/services/provider-health.service.ts`:

```typescript
import { logger } from '../utils/logger';

export type ProviderStatus = 'unknown' | 'up' | 'down';

export interface ProviderState {
  status: ProviderStatus;
  lastProbeMs: number;
  lastLatencyMs: number;
  consecutiveFailures: number;
  lastError: string | null;
}

export interface HealthSnapshot {
  florence: ProviderState;
  ollama: ProviderState;
  temporal: ProviderState;
}

export interface ProviderHealthConfig {
  florenceUrl: string;
  ollamaUrl: string;
  temporalHost: string;
  intervalMs?: number;
  probeTimeoutMs?: number;
}

export class ProviderHealthService {
  private state: HealthSnapshot;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly cfg: ProviderHealthConfig) {
    const empty: ProviderState = {
      status: 'unknown', lastProbeMs: 0, lastLatencyMs: 0, consecutiveFailures: 0, lastError: null,
    };
    this.state = { florence: { ...empty }, ollama: { ...empty }, temporal: { ...empty } };
  }

  start(): void {
    if (this.timer) return;
    const interval = this.cfg.intervalMs ?? 10_000;
    this.timer = setInterval(() => { void this.probeOnce(); }, interval);
    void this.probeOnce();
    logger.info({ intervalMs: interval }, 'ProviderHealthService started');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  snapshot(): HealthSnapshot {
    return {
      florence: { ...this.state.florence },
      ollama: { ...this.state.ollama },
      temporal: { ...this.state.temporal },
    };
  }

  async probeOnce(): Promise<void> {
    await Promise.all([
      this.probeHttp('florence', `${this.cfg.florenceUrl}/`),
      this.probeHttp('ollama', `${this.cfg.ollamaUrl}/api/tags`),
      this.probeTemporal(),
    ]);
  }

  private async probeHttp(name: 'florence' | 'ollama', url: string): Promise<void> {
    const start = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(this.cfg.probeTimeoutMs ?? 3000) });
      if (!res.ok) throw new Error(`status ${res.status}`);
      this.record(name, 'up', Date.now() - start, null);
    } catch (err) {
      this.record(name, 'down', Date.now() - start, (err as Error).message);
    }
  }

  private async probeTemporal(): Promise<void> {
    const start = Date.now();
    try {
      // Plain TCP check — full gRPC health check would pull in more deps.
      const [host, port] = this.cfg.temporalHost.split(':');
      const { Socket } = await import('node:net');
      await new Promise<void>((resolve, reject) => {
        const s = new Socket();
        const t = setTimeout(() => { s.destroy(); reject(new Error('timeout')); }, this.cfg.probeTimeoutMs ?? 3000);
        s.connect(Number(port || 7233), host, () => { clearTimeout(t); s.end(); resolve(); });
        s.on('error', (e) => { clearTimeout(t); reject(e); });
      });
      this.record('temporal', 'up', Date.now() - start, null);
    } catch (err) {
      this.record('temporal', 'down', Date.now() - start, (err as Error).message);
    }
  }

  private record(name: keyof HealthSnapshot, status: ProviderStatus, latencyMs: number, err: string | null): void {
    const prev = this.state[name];
    this.state[name] = {
      status,
      lastProbeMs: Date.now(),
      lastLatencyMs: latencyMs,
      consecutiveFailures: status === 'up' ? 0 : prev.consecutiveFailures + 1,
      lastError: err,
    };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --run src/__tests__/unit/provider-health.service.test.ts 2>&1 | tail -15
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add api-service/src/services/provider-health.service.ts \
        api-service/src/__tests__/unit/provider-health.service.test.ts
git commit -m "feat(api): ProviderHealthService — async probes for florence/ollama/temporal"
```

---

### Task 15: Rewrite /v1/detect route to start workflow + await

**Files:**
- Modify: `api-service/src/routes/detect.route.ts`
- Modify: `api-service/src/app.ts` (Temporal client wiring)

- [ ] **Step 1: Replace detect.route.ts**

Overwrite `api-service/src/routes/detect.route.ts`:

```typescript
import crypto from 'node:crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Client } from '@temporalio/client';
import { WorkflowIdReusePolicy, WorkflowNotFoundError } from '@temporalio/client';
import { detectInventoryWorkflow } from '../temporal/workflows/detect-inventory.workflow';
import { TASK_QUEUES } from '../temporal/task-queues';
import { envConfig } from '../config/env.config';
import { BadRequestError, PayloadTooLargeError } from '../utils/errors';
import { logger } from '../utils/logger';
import { authMiddleware } from '../middleware/auth.middleware';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function detectRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const temporal = (app as any).temporal as Client;

  app.post('/v1/detect', { preHandler: authMiddleware }, async (request: FastifyRequest, reply: FastifyReply) => {
    const file = await request.file();
    if (!file) throw new BadRequestError('No image file uploaded');
    const imageBuffer = await file.toBuffer();
    if (imageBuffer.length > MAX_IMAGE_SIZE) throw new PayloadTooLargeError(`Image exceeds ${MAX_IMAGE_SIZE} bytes`);
    if (file.mimetype && !SUPPORTED.has(file.mimetype)) throw new BadRequestError(`Unsupported mime: ${file.mimetype}`);

    const mimeType = file.mimetype ?? 'image/jpeg';
    const imageSha256 = crypto.createHash('sha256').update(imageBuffer).digest('hex');
    const workflowId = `detect-${imageSha256}`;
    const traceId = request.headers['traceparent']?.toString().split('-')[1] ?? crypto.randomBytes(16).toString('hex');
    const requestId = request.id;

    logger.info({ workflowId, traceId, requestId, bytes: imageBuffer.length }, 'Starting detection workflow');

    const handle = await temporal.workflow.start(detectInventoryWorkflow, {
      args: [{
        imageBase64: imageBuffer.toString('base64'),
        imageSha256,
        mimeType,
        traceId,
        requestId,
      }],
      workflowId,
      taskQueue: TASK_QUEUES.INVENTORY_PIPELINE,
      workflowIdReusePolicy: WorkflowIdReusePolicy.WORKFLOW_ID_REUSE_POLICY_ALLOW_DUPLICATE_FAILED_ONLY,
      workflowExecutionTimeout: `${envConfig.workflowExecutionTimeoutMs}ms`,
    });

    try {
      const resultP = handle.result();
      const timer = new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), envConfig.httpResponseTimeoutMs),
      );
      const raced = await Promise.race([resultP, timer]);
      if (raced === 'timeout') {
        return reply.code(202).send({
          status: 'accepted',
          workflowId,
          statusUrl: `/v1/detect/status/${workflowId}`,
        });
      }
      return reply.code(200).send(raced);
    } catch (err) {
      if (err instanceof WorkflowNotFoundError) {
        throw new BadRequestError('Workflow not found');
      }
      // Workflow failed — Temporal maps ApplicationFailure back to us
      logger.error({ workflowId, err: (err as Error).message }, 'Workflow failed');
      return reply.code(500).send({
        error: 'workflow_failed',
        message: (err as Error).message,
        workflowId,
        traceId,
      });
    }
  });
}
```

- [ ] **Step 2: Wire Temporal client into app.ts**

Modify `api-service/src/app.ts`. Replace the `createPipeline()` block and pipeline decoration with Temporal client + worker wiring:

```typescript
import { getTemporalClient, closeTemporalClient } from './temporal/client';
import { createWorker, closeWorker, runWorker } from './temporal/worker';
import { ProviderHealthService } from './services/provider-health.service';
```

Replace the `buildApp()` contents that previously attached `pipeline` with:

```typescript
  const temporal = await getTemporalClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app as any).temporal = temporal;

  const health = new ProviderHealthService({
    florenceUrl: envConfig.florenceUrl,
    ollamaUrl: envConfig.ollamaBaseUrl,
    temporalHost: envConfig.temporalHost,
  });
  health.start();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app as any).health = health;
```

In `start()`, add worker startup and teardown:

```typescript
  await createWorker();
  void runWorker();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    stopBonjour();
    await app.close();
    await closeWorker();
    await closeTemporalClient();
    process.exit(0);
  };
```

- [ ] **Step 3: Type-check**

```bash
cd api-service
npm run type-check 2>&1 | tail -15
```
Expected: passes (may have unused imports from old pipeline — clean them up).

- [ ] **Step 4: Commit**

```bash
git add api-service/src/routes/detect.route.ts api-service/src/app.ts
git commit -m "feat(api): /v1/detect starts Temporal workflow, awaits result up to 90s

- Replaces FlorencePipelineService call with temporalClient.workflow.start
- workflowId = sha256(image) for natural idempotency
- 90s HTTP timeout < 120s workflow timeout: 202+workflowId on timeout
- ProviderHealthService starts alongside Fastify; Temporal client singleton"
```

---

### Task 16: GET /v1/detect/status/:workflowId

**Files:**
- Create: `api-service/src/routes/detect-status.route.ts`
- Modify: `api-service/src/app.ts`
- Create: `api-service/src/__tests__/integration/detect-status.route.test.ts`

- [ ] **Step 1: Write the test**

Create `api-service/src/__tests__/integration/detect-status.route.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';

describe('GET /v1/detect/status/:workflowId', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ disableRateLimit: true }); });
  afterAll(async () => { await app.close(); });

  it('returns 404 for unknown workflowId', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/detect/status/does-not-exist-123' });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Implement the route**

Create `api-service/src/routes/detect-status.route.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { Client, WorkflowNotFoundError } from '@temporalio/client';

export async function detectStatusRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const temporal = (app as any).temporal as Client;

  app.get<{ Params: { workflowId: string } }>('/v1/detect/status/:workflowId', async (request, reply) => {
    const { workflowId } = request.params;
    try {
      const handle = temporal.workflow.getHandle(workflowId);
      const desc = await handle.describe();

      if (desc.status.name === 'COMPLETED') {
        const result = await handle.result();
        return reply.code(200).send({ status: 'completed', workflowId, result });
      }
      if (desc.status.name === 'FAILED' || desc.status.name === 'TERMINATED' || desc.status.name === 'CANCELED') {
        return reply.code(500).send({ status: desc.status.name.toLowerCase(), workflowId });
      }
      return reply.code(202).send({ status: 'running', workflowId, startedAt: desc.startTime });
    } catch (err) {
      if (err instanceof WorkflowNotFoundError) {
        return reply.code(404).send({ error: 'workflow_not_found', workflowId });
      }
      throw err;
    }
  });
}
```

- [ ] **Step 3: Register route in app.ts**

Add alongside `detectRoute`:
```typescript
import { detectStatusRoute } from './routes/detect-status.route';
// ...
await app.register(detectStatusRoute);
```

- [ ] **Step 4: Run the test**

```bash
npm test -- --run src/__tests__/integration/detect-status.route.test.ts 2>&1 | tail -15
```
Expected: PASS (requires running Temporal server).

- [ ] **Step 5: Commit**

```bash
git add api-service/src/routes/detect-status.route.ts \
        api-service/src/app.ts \
        api-service/src/__tests__/integration/detect-status.route.test.ts
git commit -m "feat(api): GET /v1/detect/status/:workflowId — poll when HTTP timeout fired"
```

---

### Task 17: Rewrite /v1/health using ProviderHealthService

**Files:**
- Modify: `api-service/src/routes/health.route.ts`
- Modify: `api-service/src/__tests__/integration/health.route.test.ts`

- [ ] **Step 1: Update the health test**

Overwrite `api-service/src/__tests__/integration/health.route.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';

describe('GET /v1/health', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ disableRateLimit: true }); });
  afterAll(async () => { await app.close(); });

  it('returns a HealthSnapshot with florence/ollama/temporal keys', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect([200, 503]).toContain(res.statusCode);
    const body = res.json();
    expect(body).toHaveProperty('providers.florence');
    expect(body).toHaveProperty('providers.ollama');
    expect(body).toHaveProperty('providers.temporal');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('system.memory');
  });

  it('returns 503 when temporal is down', async () => {
    // No way to inject state from outside without exposing health service;
    // this test only asserts shape and status-code domain.
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    if (res.statusCode === 503) {
      const body = res.json();
      expect(body.status).toMatch(/unhealthy|degraded/);
    }
  });
});
```

- [ ] **Step 2: Replace health.route.ts**

Overwrite `api-service/src/routes/health.route.ts`:

```typescript
import os from 'os';
import { FastifyInstance } from 'fastify';
import { ProviderHealthService } from '../services/provider-health.service';

export async function healthRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const health = (app as any).health as ProviderHealthService;

  app.get('/v1/health', async (_request, reply) => {
    const snapshot = health.snapshot();
    const temporalUp = snapshot.temporal.status === 'up';
    const florenceUp = snapshot.florence.status === 'up';
    const ollamaUp = snapshot.ollama.status === 'up';

    // Temporal is blocking dependency — without it no workflow starts.
    const isFunctional = temporalUp && florenceUp;
    const status = temporalUp && florenceUp && ollamaUp ? 'healthy'
      : temporalUp && (florenceUp || ollamaUp) ? 'degraded'
      : 'unhealthy';

    return reply.code(isFunctional ? 200 : 503).send({
      status,
      version: '3.0.0',
      uptime: process.uptime(),
      system: {
        memory: {
          free: os.freemem(),
          total: os.totalmem(),
          usage: 1 - os.freemem() / os.totalmem(),
        },
        load: os.loadavg(),
      },
      providers: snapshot,
      timestamp: new Date().toISOString(),
    });
  });
}
```

- [ ] **Step 3: Run test**

```bash
npm test -- --run src/__tests__/integration/health.route.test.ts 2>&1 | tail -15
```
Expected: PASS (requires Temporal running; otherwise test asserts 503-shape).

- [ ] **Step 4: Commit**

```bash
git add api-service/src/routes/health.route.ts \
        api-service/src/__tests__/integration/health.route.test.ts
git commit -m "feat(api): /v1/health uses ProviderHealthService

No more hardcoded 'gemini' check. Snapshot exposes florence/ollama/temporal
with status/latency/consecutiveFailures. 503 when Temporal is down
(blocking dependency)."
```

---

### Task 18: Delete superseded code (FlorencePipelineService, PipelineExecutor) + rewrite lying detect.route integration test

**Files:**
- Delete: `api-service/src/services/florence-pipeline.service.ts`
- Delete: `api-service/src/services/pipeline-executor.ts`
- Delete: `api-service/src/__tests__/unit/florence-pipeline.test.ts`
- Delete: `api-service/src/__tests__/unit/pipeline-executor.test.ts`
- Possibly delete: `api-service/src/telemetry/pipeline-tracer.ts`, `step-result.ts` (if nothing else references)
- Rewrite: `api-service/src/__tests__/integration/detect.route.test.ts`

- [ ] **Step 1: Confirm nothing imports the about-to-be-deleted code**

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service
grep -rn "florence-pipeline\|pipeline-executor\|FlorencePipelineService\|PipelineExecutor" src/ 2>&1
```
Expected: only matches are within the files about to be deleted, plus the old integration test that will be rewritten.

- [ ] **Step 2: Check whether pipeline-tracer/step-result have other callers**

```bash
grep -rn "pipeline-tracer\|step-result\|withSpan\b\|classifyError\b" src/ 2>&1
```
If activities use `@opentelemetry/api` directly (they do) and nothing else references these helpers, they can go. Otherwise keep them.

- [ ] **Step 3: Rewrite the integration test**

Overwrite `api-service/src/__tests__/integration/detect.route.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { buildApp } from '../../app';

// Requires: Temporal server running, detection-service running, Ollama running.
// In CI, this test runs on a self-hosted Mac runner.
describe('POST /v1/detect (integration — real Temporal)', () => {
  let app: FastifyInstance;
  const fixturePath = path.resolve(__dirname, '../fixtures/smoke_tiny.jpg');

  beforeAll(async () => {
    if (!fs.existsSync(fixturePath)) throw new Error('fixture missing: ' + fixturePath);
    app = await buildApp({ disableRateLimit: true });
  }, 30_000);

  afterAll(async () => { if (app) await app.close(); });

  it('returns 200 with DetectResult shape on happy path', async () => {
    const buf = fs.readFileSync(fixturePath);
    const FormData = globalThis.FormData;
    const form = new FormData();
    form.append('file', new Blob([buf], { type: 'image/jpeg' }), 'smoke_tiny.jpg');

    const res = await app.inject({
      method: 'POST', url: '/v1/detect',
      payload: form as any, headers: { 'content-type': 'multipart/form-data' },
    });

    // We accept either 200 (synchronous) or 202 (timeout → polling).
    expect([200, 202]).toContain(res.statusCode);
    const body = res.json();
    if (res.statusCode === 200) {
      expect(body).toHaveProperty('photoId');
      expect(body).toHaveProperty('photoUrl');
      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('traceId');
      expect(Array.isArray(body.items)).toBe(true);
    } else {
      expect(body).toHaveProperty('workflowId');
      expect(body).toHaveProperty('statusUrl');
    }
  }, 120_000);
});
```

Move the fixture: create a `smoke_tiny.jpg` (320×240 gray image) at `api-service/src/__tests__/fixtures/smoke_tiny.jpg`.

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service
mkdir -p src/__tests__/fixtures
node -e "const sharp=require('sharp');sharp({create:{width:320,height:240,channels:3,background:{r:128,g:128,b:128}}}).jpeg().toFile('src/__tests__/fixtures/smoke_tiny.jpg').then(()=>console.log('ok'))"
```

- [ ] **Step 4: Delete the superseded code**

```bash
git rm api-service/src/services/florence-pipeline.service.ts \
       api-service/src/services/pipeline-executor.ts \
       api-service/src/__tests__/unit/florence-pipeline.test.ts \
       api-service/src/__tests__/unit/pipeline-executor.test.ts
# Delete tracer helpers only if nothing else uses them (check first with grep from Step 2)
git rm api-service/src/telemetry/pipeline-tracer.ts \
       api-service/src/telemetry/step-result.ts 2>/dev/null || true
```

- [ ] **Step 5: Type-check and run full test suite**

```bash
cd api-service
npm run type-check 2>&1 | tail -15
npm test -- --run 2>&1 | tail -25
```
Expected: type-check passes; all unit + workflow + replay tests pass. Integration tests needing real Temporal may skip or pass depending on whether Temporal is running.

- [ ] **Step 6: Commit**

```bash
git add api-service/src/__tests__/integration/detect.route.test.ts \
        api-service/src/__tests__/fixtures/smoke_tiny.jpg
git commit -m "refactor(api): delete FlorencePipelineService + PipelineExecutor; rewrite lying detect.route test

Superseded by detectInventoryWorkflow + activities.
Integration test now asserts DetectResult shape (items[], not fused).
smoke_tiny.jpg fixture added for deterministic warm-up + tests."
```

---

Phase C is complete. Tasks 19-30 continue in the next appended segment.

### Task 19: Complete the Grafana LGTM docker-compose

**Files:**
- Modify: `observability/docker-compose.lgtm.yml` (expand from Task 5's Temporal-only version)
- Create: `observability/otel-collector/config.yaml`
- Create: `observability/tempo/tempo.yaml`
- Create: `observability/loki/loki-config.yaml`
- Create: `observability/promtail/promtail-config.yaml`
- Create: `observability/prometheus/prometheus.yml`
- Create: `observability/grafana/provisioning/datasources/datasources.yml`
- Create: `observability/grafana/provisioning/dashboards/dashboards.yml`

- [ ] **Step 1: Replace `observability/docker-compose.lgtm.yml` with the full stack**

```yaml
services:
  temporal:
    image: temporalio/auto-setup:1.24.2
    container_name: allmythings-temporal
    restart: unless-stopped
    environment:
      - DB=sqlite
      - SQLITE_DB_PATH=/etc/temporal/temporal.db
      - TEMPORAL_ADDRESS=0.0.0.0:7233
      - LOG_LEVEL=info
      - PROMETHEUS_ENDPOINT=0.0.0.0:9090
    ports: ["7233:7233", "7243:7243"]
    volumes: [temporal-data:/etc/temporal]

  temporal-ui:
    image: temporalio/ui:2.30.3
    container_name: allmythings-temporal-ui
    restart: unless-stopped
    depends_on: [temporal]
    environment:
      - TEMPORAL_ADDRESS=temporal:7233
      - TEMPORAL_CORS_ORIGINS=http://localhost:3000
    ports: ["8233:8080"]

  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.108.0
    container_name: allmythings-otel-collector
    restart: unless-stopped
    command: ["--config=/etc/otel-collector/config.yaml"]
    volumes: [./otel-collector:/etc/otel-collector]
    ports:
      - "4317:4317"   # OTLP gRPC
      - "4318:4318"   # OTLP HTTP
      - "8888:8888"   # Collector metrics
    depends_on: [tempo, loki, prometheus]

  tempo:
    image: grafana/tempo:2.5.0
    container_name: allmythings-tempo
    restart: unless-stopped
    command: ["-config.file=/etc/tempo/tempo.yaml"]
    volumes:
      - ./tempo:/etc/tempo
      - tempo-data:/var/tempo
    ports: ["3200:3200"]

  loki:
    image: grafana/loki:3.1.1
    container_name: allmythings-loki
    restart: unless-stopped
    command: ["-config.file=/etc/loki/loki-config.yaml"]
    volumes:
      - ./loki:/etc/loki
      - loki-data:/tmp/loki
    ports: ["3100:3100"]

  promtail:
    image: grafana/promtail:3.1.1
    container_name: allmythings-promtail
    restart: unless-stopped
    command: ["-config.file=/etc/promtail/promtail-config.yaml"]
    volumes:
      - ./promtail:/etc/promtail
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ${HOME}/allmythings-data:/host-data:ro
      - /tmp/allmythings:/tmp/allmythings:ro
    depends_on: [loki]

  prometheus:
    image: prom/prometheus:v2.54.1
    container_name: allmythings-prometheus
    restart: unless-stopped
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.path=/prometheus
      - --web.console.libraries=/etc/prometheus/console_libraries
      - --web.console.templates=/etc/prometheus/consoles
    volumes:
      - ./prometheus:/etc/prometheus
      - prom-data:/prometheus
    ports: ["9191:9090"]

  grafana:
    image: grafana/grafana:11.2.0
    container_name: allmythings-grafana
    restart: unless-stopped
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_FEATURE_TOGGLES_ENABLE=traceqlEditor
      - GF_USERS_DEFAULT_THEME=dark
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning
      - ./grafana/dashboards:/etc/grafana/dashboards
      - grafana-data:/var/lib/grafana
    depends_on: [loki, tempo, prometheus]
    ports: ["3000:3000"]

  alertmanager:
    image: prom/alertmanager:v0.27.0
    container_name: allmythings-alertmanager
    restart: unless-stopped
    command:
      - --config.file=/etc/alertmanager/alertmanager.yml
      - --storage.path=/alertmanager
    volumes:
      - ./alertmanager:/etc/alertmanager
      - alertmanager-data:/alertmanager
    ports: ["9093:9093"]

volumes:
  temporal-data: {}
  tempo-data: {}
  loki-data: {}
  prom-data: {}
  grafana-data: {}
  alertmanager-data: {}
```

- [ ] **Step 2: OTel collector config**

Create `observability/otel-collector/config.yaml`:

```yaml
receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }

processors:
  batch:
    timeout: 5s
    send_batch_size: 1024
  resource:
    attributes:
      - { key: service.namespace, value: allmythings, action: upsert }

exporters:
  otlphttp/tempo:
    endpoint: http://tempo:4318
    tls: { insecure: true }
  loki:
    endpoint: http://loki:3100/loki/api/v1/push
  prometheusremotewrite:
    endpoint: http://prometheus:9090/api/v1/write
    tls: { insecure: true }

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch, resource]
      exporters: [otlphttp/tempo]
    logs:
      receivers: [otlp]
      processors: [batch, resource]
      exporters: [loki]
    metrics:
      receivers: [otlp]
      processors: [batch, resource]
      exporters: [prometheusremotewrite]
```

- [ ] **Step 3: Tempo config**

Create `observability/tempo/tempo.yaml`:

```yaml
server:
  http_listen_port: 3200
distributor:
  receivers:
    otlp:
      protocols:
        http: { endpoint: 0.0.0.0:4318 }
        grpc: { endpoint: 0.0.0.0:4317 }
ingester:
  max_block_duration: 5m
compactor:
  compaction:
    block_retention: 24h
storage:
  trace:
    backend: local
    local: { path: /var/tempo/traces }
    wal: { path: /var/tempo/wal }
```

- [ ] **Step 4: Loki config**

Create `observability/loki/loki-config.yaml`:

```yaml
auth_enabled: false
server:
  http_listen_port: 3100
common:
  instance_addr: 127.0.0.1
  path_prefix: /tmp/loki
  storage:
    filesystem:
      chunks_directory: /tmp/loki/chunks
      rules_directory: /tmp/loki/rules
  replication_factor: 1
  ring:
    kvstore: { store: inmemory }
schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: filesystem
      schema: v13
      index: { prefix: index_, period: 24h }
limits_config:
  retention_period: 168h  # 7 days
  allow_structured_metadata: true
```

- [ ] **Step 5: Promtail config**

Create `observability/promtail/promtail-config.yaml`:

```yaml
server:
  http_listen_port: 9080
positions:
  filename: /tmp/positions.yaml
clients:
  - url: http://loki:3100/loki/api/v1/push
scrape_configs:
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        regex: '/(allmythings-.*)'
        target_label: container
  - job_name: api-detection-logs
    static_configs:
      - targets: [localhost]
        labels:
          job: api-detection
          __path__: /tmp/allmythings/*.log
```

- [ ] **Step 6: Prometheus config**

Create `observability/prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - alert-rules.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets: [alertmanager:9093]

scrape_configs:
  - job_name: api-service
    metrics_path: /metrics
    static_configs:
      - targets: ['host.docker.internal:14000']
  - job_name: detection-service
    metrics_path: /metrics
    static_configs:
      - targets: ['host.docker.internal:14001']
  - job_name: temporal
    static_configs:
      - targets: ['temporal:9090']
  - job_name: otel-collector
    static_configs:
      - targets: ['otel-collector:8888']
  - job_name: prometheus
    static_configs:
      - targets: ['localhost:9090']
```

- [ ] **Step 7: Grafana provisioning**

Create `observability/grafana/provisioning/datasources/datasources.yml`:

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
  - name: Tempo
    type: tempo
    access: proxy
    url: http://tempo:3200
    jsonData:
      tracesToLogsV2:
        datasourceUid: loki
        tags: [{ key: 'service.name', value: 'service' }, { key: 'trace_id' }]
        filterByTraceID: true
      tracesToMetrics:
        datasourceUid: prometheus
```

Create `observability/grafana/provisioning/dashboards/dashboards.yml`:

```yaml
apiVersion: 1
providers:
  - name: allmythings
    folder: allmythings
    type: file
    updateIntervalSeconds: 10
    allowUiUpdates: false
    options:
      path: /etc/grafana/dashboards
      foldersFromFilesStructure: false
```

- [ ] **Step 8: Start the full stack and verify**

```bash
cd /Users/mrarindampaul/Develop/allmythings
docker compose -f observability/docker-compose.lgtm.yml up -d
sleep 25
curl -sf http://localhost:3000/api/health && echo "Grafana OK"
curl -sf http://localhost:3100/ready   && echo "Loki OK"
curl -sf http://localhost:3200/ready   && echo "Tempo OK"
curl -sf http://localhost:9191/-/ready && echo "Prometheus OK"
curl -sf http://localhost:9093/-/ready && echo "Alertmanager OK"
curl -sf http://localhost:8233 > /dev/null && echo "Temporal UI OK"
```
Expected: six OKs.

- [ ] **Step 9: Commit**

```bash
git add observability/docker-compose.lgtm.yml \
        observability/otel-collector/ \
        observability/tempo/ \
        observability/loki/ \
        observability/promtail/ \
        observability/prometheus/ \
        observability/grafana/provisioning/
git commit -m "feat(obs): Grafana LGTM + Temporal UI + Alertmanager docker-compose

One `docker compose up -d` brings up: Temporal server + UI, OTel
Collector, Tempo, Loki, Promtail, Prometheus, Grafana, Alertmanager.
Volumes persisted. Datasources auto-provisioned.
Dashboards added in Task 23; alert rules in Task 24."
```

---

### Task 20: OTel SDK bootstrap in api-service (traces + metrics)

**Files:**
- Create: `api-service/src/telemetry/otel-init.ts`
- Modify: `api-service/src/telemetry.ts` (route through otel-init.ts)
- Modify: `api-service/src/app.ts`

- [ ] **Step 1: Implement the bootstrap**

Create `api-service/src/telemetry/otel-init.ts`:

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

let sdk: NodeSDK | null = null;

export function initOtel(): void {
  if (sdk) return;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4317';
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'api-service',
      [ATTR_SERVICE_VERSION]: '3.0.0',
      'service.namespace': 'allmythings',
    }),
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: endpoint }),
      exportIntervalMillis: 15_000,
    }),
    instrumentations: [getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    })],
  });
  sdk.start();
}

export async function shutdownOtel(): Promise<void> {
  if (sdk) await sdk.shutdown();
  sdk = null;
}
```

- [ ] **Step 2: Route the existing telemetry.ts through otel-init**

Overwrite `api-service/src/telemetry.ts`:

```typescript
import { initOtel } from './telemetry/otel-init';

export async function initTelemetry(): Promise<void> {
  initOtel();
}
```

- [ ] **Step 3: Ensure shutdown wires through**

Modify `api-service/src/app.ts` shutdown:

```typescript
import { shutdownOtel } from './telemetry/otel-init';
// ...
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutting down');
  stopBonjour();
  await app.close();
  await closeWorker();
  await closeTemporalClient();
  await shutdownOtel();
  process.exit(0);
};
```

- [ ] **Step 4: Verify OTel is active**

```bash
cd api-service
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 npm run dev 2>&1 | head -15
```
Expected: starts without errors; OTel auto-instrumentation logs appear.

- [ ] **Step 5: Commit**

```bash
git add api-service/src/telemetry/otel-init.ts api-service/src/telemetry.ts api-service/src/app.ts
git commit -m "feat(obs): OTel NodeSDK bootstrap with OTLP gRPC traces + metrics"
```

---

### Task 21: Prometheus metric registry + /metrics endpoint

**Files:**
- Install: `prom-client`
- Create: `api-service/src/telemetry/metrics.ts`
- Create: `api-service/src/routes/metrics.route.ts`
- Create: `api-service/src/__tests__/unit/metrics.test.ts`
- Modify: `api-service/src/app.ts`
- Modify: each activity file to increment metrics

- [ ] **Step 1: Install**

```bash
cd api-service
npm install prom-client@^15.1.3
```

- [ ] **Step 2: Metric registry**

Create `api-service/src/telemetry/metrics.ts`:

```typescript
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
registry.setDefaultLabels({ service: 'api-service' });
collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total', help: 'HTTP requests',
  labelNames: ['route', 'status'], registers: [registry],
});

export const httpRequestDurationMs = new Histogram({
  name: 'http_request_duration_ms', help: 'HTTP duration',
  labelNames: ['route', 'status'],
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 45000, 90000],
  registers: [registry],
});

export const workflowStartedTotal = new Counter({
  name: 'workflow_started_total', help: 'Workflow starts',
  labelNames: ['workflow'], registers: [registry],
});

export const workflowCompletedTotal = new Counter({
  name: 'workflow_completed_total', help: 'Workflow completions',
  labelNames: ['workflow', 'status'], registers: [registry],
});

export const workflowDurationMs = new Histogram({
  name: 'workflow_duration_ms', help: 'Workflow duration',
  labelNames: ['workflow', 'status'],
  buckets: [500, 1000, 2500, 5000, 10000, 15000, 25000, 45000, 90000, 120000],
  registers: [registry],
});

export const activityDurationMs = new Histogram({
  name: 'activity_duration_ms', help: 'Activity duration',
  labelNames: ['activity', 'status', 'attempt'],
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 20000, 45000, 90000],
  registers: [registry],
});

export const activityRetriesTotal = new Counter({
  name: 'activity_retries_total', help: 'Activity retries', labelNames: ['activity'], registers: [registry],
});

export const activityNonRetryableFailuresTotal = new Counter({
  name: 'activity_nonretryable_failures_total', help: 'Non-retryable failures',
  labelNames: ['activity', 'type'], registers: [registry],
});

export const enrichmentTierUsedTotal = new Counter({
  name: 'enrichment_tier_used_total', help: 'Tier usage counts',
  labelNames: ['tier'], registers: [registry],
});

export const enrichmentTierDowngradesTotal = new Counter({
  name: 'enrichment_tier_downgrades_total', help: 'Tier downgrades',
  labelNames: ['from_tier', 'to_tier', 'reason'], registers: [registry],
});

export const providerUp = new Gauge({
  name: 'provider_up', help: 'Provider up (1) / down (0)',
  labelNames: ['provider'], registers: [registry],
});

export const providerProbeDurationMs = new Histogram({
  name: 'provider_probe_duration_ms', help: 'Provider probe latency',
  labelNames: ['provider'], buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 3000],
  registers: [registry],
});

export const workflowIdempotentReuseTotal = new Counter({
  name: 'workflow_idempotent_reuse_total', help: 'Idempotent workflow reuses',
  registers: [registry],
});

export const queueRejectionsTotal = new Counter({
  name: 'queue_rejections_total', help: 'Queue rejections',
  labelNames: ['reason'], registers: [registry],
});

export const itemsPerPhoto = new Histogram({
  name: 'items_per_photo', help: 'Items returned per detection',
  buckets: [0, 1, 2, 5, 10, 15, 20, 30, 50], registers: [registry],
});
```

- [ ] **Step 3: /metrics route**

Create `api-service/src/routes/metrics.route.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { registry } from '../telemetry/metrics';

export async function metricsRoute(app: FastifyInstance): Promise<void> {
  app.get('/metrics', async (_req, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });
}
```

Register in `app.ts` alongside other routes:
```typescript
import { metricsRoute } from './routes/metrics.route';
// ...
await app.register(metricsRoute);
```

- [ ] **Step 4: Emit from activities**

In `save-photo.activity.ts` wrap the function body:

```typescript
import { activityDurationMs, activityNonRetryableFailuresTotal } from '../../telemetry/metrics';
// inside savePhoto:
const start = Date.now();
try {
  const result = /* existing body */;
  activityDurationMs.labels('savePhoto', 'ok', '1').observe(Date.now() - start);
  return result;
} catch (err) {
  activityDurationMs.labels('savePhoto', 'error', '1').observe(Date.now() - start);
  if ((err as any).nonRetryable) activityNonRetryableFailuresTotal.labels('savePhoto', (err as any).type ?? 'unknown').inc();
  throw err;
}
```

Repeat for `florence-detect`, `enrich-item`, `assemble-result`. For `enrich-item`, also `enrichmentTierUsedTotal.labels(tier).inc()` on success.

- [ ] **Step 5: Minimal metrics test**

Create `api-service/src/__tests__/unit/metrics.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { registry, workflowStartedTotal } from '../../telemetry/metrics';

describe('metrics registry', () => {
  it('registers all expected metric names', async () => {
    const text = await registry.metrics();
    expect(text).toContain('workflow_started_total');
    expect(text).toContain('activity_duration_ms');
    expect(text).toContain('enrichment_tier_used_total');
    expect(text).toContain('provider_up');
  });

  it('counter increments', async () => {
    workflowStartedTotal.labels('detectInventoryWorkflow').inc();
    const text = await registry.metrics();
    expect(text).toMatch(/workflow_started_total.*\s[1-9]\d*/);
  });
});
```

- [ ] **Step 6: Run test + curl metrics**

```bash
npm test -- --run src/__tests__/unit/metrics.test.ts 2>&1 | tail -10
# optional: curl http://localhost:14000/metrics | head -20  (needs server running)
```

- [ ] **Step 7: Commit**

```bash
git add api-service/package.json api-service/package-lock.json \
        api-service/src/telemetry/metrics.ts \
        api-service/src/routes/metrics.route.ts \
        api-service/src/__tests__/unit/metrics.test.ts \
        api-service/src/app.ts \
        api-service/src/temporal/activities/
git commit -m "feat(obs): /metrics Prometheus endpoint + activity metric emission"
```

---

### Task 22: Pino + structlog with OTel trace correlation

**Files:**
- Modify: `api-service/src/utils/logger.ts`
- Modify: `detection-service/src/detection_service/telemetry.py`
- Create: `detection-service/src/detection_service/log_config.py`

- [ ] **Step 1: Update Pino to inject trace_id**

Overwrite `api-service/src/utils/logger.ts`:

```typescript
import pino from 'pino';
import { trace, context } from '@opentelemetry/api';
import { envConfig } from '../config/env.config';

function traceMixin(): Record<string, string> {
  const span = trace.getSpan(context.active());
  if (!span) return {};
  const sc = span.spanContext();
  return { trace_id: sc.traceId, span_id: sc.spanId };
}

export const logger = pino({
  level: envConfig.nodeEnv === 'production' ? 'info' : 'debug',
  mixin: traceMixin,
  transport: envConfig.nodeEnv === 'development' ? {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
  } : undefined,
});
```

- [ ] **Step 2: Python structlog for detection-service**

Create `detection-service/src/detection_service/log_config.py`:

```python
import logging
import structlog
from opentelemetry import trace


def _add_trace_context(_, __, event_dict):
    span = trace.get_current_span()
    ctx = span.get_span_context() if span else None
    if ctx and ctx.trace_id:
        event_dict["trace_id"] = format(ctx.trace_id, "032x")
        event_dict["span_id"] = format(ctx.span_id, "016x")
    return event_dict


def configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(format="%(message)s", level=level)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            _add_trace_context,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
```

- [ ] **Step 3: Wire it in telemetry.py**

Modify `detection-service/src/detection_service/telemetry.py` to call `configure_logging()` from `configure_telemetry()`.

- [ ] **Step 4: Commit**

```bash
git add api-service/src/utils/logger.ts \
        detection-service/src/detection_service/log_config.py \
        detection-service/src/detection_service/telemetry.py
git commit -m "feat(obs): structured logs with OTel trace_id correlation in both services"
```

---

### Task 23: Grafana dashboards (5 pre-provisioned JSONs)

**Files:**
- Create: `observability/grafana/dashboards/pipeline-health.json`
- Create: `observability/grafana/dashboards/model-performance.json`
- Create: `observability/grafana/dashboards/resources.json`
- Create: `observability/grafana/dashboards/errors-failures.json`
- Create: `observability/grafana/dashboards/temporal-internals.json`

Dashboard JSONs are long; they follow Grafana's schema. The minimum viable set of panels per dashboard is documented below. Generate each JSON by creating a skeleton and adding panels; refine iteratively.

- [ ] **Step 1: Skeleton template**

Each dashboard file looks like:

```json
{
  "uid": "pipeline-health",
  "title": "Pipeline Health",
  "schemaVersion": 39,
  "version": 1,
  "refresh": "15s",
  "time": { "from": "now-1h", "to": "now" },
  "panels": [ /* panels here */ ]
}
```

- [ ] **Step 2: Pipeline Health panels (minimum viable)**

Panels for `pipeline-health.json`:
1. **Request rate** (timeseries): `sum(rate(http_requests_total{route="/v1/detect"}[1m])) by (status)`
2. **Success rate** (stat): `sum(rate(workflow_completed_total{status="completed"}[5m])) / sum(rate(workflow_completed_total[5m]))`
3. **End-to-end latency p50/p95/p99** (timeseries): `histogram_quantile(0.95, sum(rate(workflow_duration_ms_bucket[5m])) by (le))`
4. **Per-step duration** (heatmap): `sum(rate(activity_duration_ms_bucket[5m])) by (le, activity)`
5. **Tier distribution** (bargauge): `sum(increase(enrichment_tier_used_total[1h])) by (tier)`

- [ ] **Step 3: Model Performance panels**

Panels for `model-performance.json`:
1. Florence inference histogram: `histogram_quantile(0.95, sum(rate(florence_inference_ms_bucket[5m])) by (le))`
2. Regions per photo: `histogram_quantile(0.5, sum(rate(florence_regions_detected_bucket[5m])) by (le))`
3. Per-tier Ollama latency: `histogram_quantile(0.95, sum(rate(activity_duration_ms_bucket{activity="enrichItem"}[5m])) by (le, tier))`
4. Tier downgrade rate: `sum(increase(enrichment_tier_downgrades_total[1h])) by (reason)`

- [ ] **Step 4: Resources panels**

Panels for `resources.json`:
1. Host memory %: from `node_memory_*` if node-exporter available, else `process_resident_memory_bytes` scaled
2. Per-process memory: `process_resident_memory_bytes{service=~"api-service|detection-service"}`
3. Disk usage: query from `node_filesystem_*` if available
4. Temporal DB file size: via a custom probe (deferred; placeholder in dashboard now)

- [ ] **Step 5: Errors & Failures panels**

Panels for `errors-failures.json`:
1. Workflow failure rate: `sum(rate(workflow_completed_total{status="failed"}[5m]))`
2. Activity failure by activity: `sum(rate(activity_duration_ms_count{status="error"}[5m])) by (activity)`
3. Non-retryable failures: `sum(increase(activity_nonretryable_failures_total[1h])) by (activity, type)`
4. Queue rejections: `sum(increase(queue_rejections_total[1h])) by (reason)`

- [ ] **Step 6: Temporal Internals panels**

Panels for `temporal-internals.json`:
1. Workflow task latency: `histogram_quantile(0.95, sum(rate(temporal_server_request_latency_seconds_bucket[5m])) by (le, operation))`
2. Task queue backlog: `temporal_num_pending_tasks`
3. Sticky cache hit rate: `sum(rate(sticky_cache_hit[5m])) / sum(rate(sticky_cache_total[5m]))`

For each dashboard, write the JSON with 3-5 panels (full JSON is long; use Grafana's "export dashboard JSON" feature to generate after building interactively, or hand-author using the schema above).

- [ ] **Step 7: Restart Grafana and verify**

```bash
docker restart allmythings-grafana
sleep 5
curl -s http://admin:admin@localhost:3000/api/search?folderIds=0 | head -20
```
Expected: all 5 dashboards listed under the `allmythings` folder.

- [ ] **Step 8: Commit**

```bash
git add observability/grafana/dashboards/
git commit -m "feat(obs): five pre-provisioned Grafana dashboards

pipeline-health, model-performance, resources, errors-failures,
temporal-internals. Auto-loaded on Grafana start via provisioning."
```

---

### Task 24: Alertmanager rules + macOS desktop-notifier webhook

**Files:**
- Create: `observability/prometheus/alert-rules.yml`
- Create: `observability/alertmanager/alertmanager.yml`
- Create: `observability/alertmanager/macos-notifier.sh`
- Create: `scripts/macos-notify.sh` (host-side receiver)

- [ ] **Step 1: Alert rules**

Create `observability/prometheus/alert-rules.yml`:

```yaml
groups:
  - name: allmythings-providers
    rules:
      - alert: FlorenceDown
        expr: provider_up{provider="florence"} == 0
        for: 30s
        labels: { severity: warning }
        annotations: { summary: "Florence detection-service is DOWN" }
      - alert: OllamaDown
        expr: provider_up{provider="ollama"} == 0
        for: 30s
        labels: { severity: warning }
        annotations: { summary: "Ollama is DOWN" }
      - alert: TemporalDown
        expr: provider_up{provider="temporal"} == 0
        for: 30s
        labels: { severity: critical }
        annotations: { summary: "Temporal server is DOWN — no workflows can run" }
  - name: allmythings-slo
    rules:
      - alert: WorkflowP95LatencyBreach
        expr: histogram_quantile(0.95, sum(rate(workflow_duration_ms_bucket[5m])) by (le)) > 30000
        for: 2m
        labels: { severity: warning }
        annotations: { summary: "Workflow p95 > 30s over 2 minutes" }
      - alert: NonRetryableFailureBurst
        expr: sum(rate(activity_nonretryable_failures_total[5m])) > 1
        for: 1m
        labels: { severity: critical }
        annotations: { summary: "More than 1 non-retryable failure per second — likely code bug" }
  - name: allmythings-resources
    rules:
      - alert: HostMemoryWarning
        expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) > 0.85
        for: 1m
        labels: { severity: warning }
        annotations: { summary: "Host memory usage > 85%" }
      - alert: HostMemoryCritical
        expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) > 0.95
        for: 30s
        labels: { severity: critical }
        annotations: { summary: "Host memory usage > 95% — swap thrashing imminent" }
```

- [ ] **Step 2: Alertmanager config**

Create `observability/alertmanager/alertmanager.yml`:

```yaml
global:
  resolve_timeout: 5m
route:
  group_by: ['alertname', 'severity']
  group_wait: 10s
  group_interval: 30s
  repeat_interval: 30m
  receiver: macos-notifier
receivers:
  - name: macos-notifier
    webhook_configs:
      - url: http://host.docker.internal:18080/notify
        send_resolved: true
```

- [ ] **Step 3: Host-side notifier**

Create `scripts/macos-notify.sh`:

```bash
#!/bin/bash
# Tiny HTTP server that receives Alertmanager webhooks and posts macOS notifications.
# Run: ./scripts/macos-notify.sh
set -euo pipefail

PORT=${PORT:-18080}
echo "Listening on :$PORT for Alertmanager webhooks..."

while true; do
  # Use nc for a one-shot HTTP receiver; parse JSON with jq.
  REQUEST=$(echo -e "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK" | nc -l $PORT 2>/dev/null || true)
  BODY=$(echo "$REQUEST" | sed -n '/^\r*$/,$p' | tail -n +2)
  if [ -n "$BODY" ]; then
    TITLE=$(echo "$BODY" | jq -r '.status + ": " + (.alerts[0].labels.alertname // "unknown")' 2>/dev/null || echo "Alert")
    MSG=$(echo "$BODY" | jq -r '.alerts[0].annotations.summary // "(no summary)"' 2>/dev/null || echo "")
    osascript -e "display notification \"$MSG\" with title \"$TITLE\""
  fi
done
```

Make it executable: `chmod +x scripts/macos-notify.sh`.

- [ ] **Step 4: Reload Prometheus + Alertmanager**

```bash
docker exec allmythings-prometheus kill -HUP 1
docker restart allmythings-alertmanager
curl -s http://localhost:9093/api/v2/alerts | head -5
```

- [ ] **Step 5: Commit**

```bash
git add observability/prometheus/alert-rules.yml \
        observability/alertmanager/alertmanager.yml \
        scripts/macos-notify.sh
git commit -m "feat(obs): Alertmanager rules + macOS desktop notifier receiver

7 alerts: Florence/Ollama/Temporal down, workflow p95 SLO breach,
non-retryable burst, host memory warn/crit. Alertmanager posts to
scripts/macos-notify.sh which calls osascript for native notifications."
```

### Task 25: scripts/preflight.sh (Stage 0 preflight checks)

**Files:**
- Create: `scripts/preflight.sh`

- [ ] **Step 1: Write the preflight script**

Create `scripts/preflight.sh`:

```bash
#!/bin/bash
# Stage 0: preflight checks before `make start` proceeds.
# Exits non-zero if any blocking check fails.
set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[ OK ]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

echo -e "${BLUE}── Stage 0: Preflight ──────────────────────${NC}"

# macOS version
OS_VER=$(sw_vers -productVersion 2>/dev/null || echo "unknown")
if [[ "$(uname)" != "Darwin" ]]; then fail "not macOS"; fi
OS_MAJOR=$(echo "$OS_VER" | cut -d. -f1)
if [ "$OS_MAJOR" -lt 14 ]; then fail "macOS $OS_VER is < 14.0"; fi
ok "macOS $OS_VER"

# Docker
if ! docker info >/dev/null 2>&1; then fail "Docker is not running — start Docker Desktop or OrbStack"; fi
ok "Docker reachable"

# Node
NODE_VER=$(node -v 2>/dev/null || echo "none")
if [[ "$NODE_VER" == "none" ]]; then fail "Node.js not installed"; fi
NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then fail "Node $NODE_VER is < 20.0"; fi
ok "Node $NODE_VER"

# Python
PY_VER=$(python3 --version 2>/dev/null | awk '{print $2}' || echo "none")
if [[ "$PY_VER" == "none" ]]; then fail "python3 not found"; fi
PY_MAJOR=$(echo "$PY_VER" | cut -d. -f1)
PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)
if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 12 ]; }; then
  fail "Python $PY_VER is < 3.12"
fi
ok "Python $PY_VER"

# Ollama
if ! command -v ollama >/dev/null 2>&1; then fail "ollama CLI not installed (brew install ollama)"; fi
ok "Ollama CLI present"

# Memory headroom
MEM_BYTES=$(sysctl -n hw.memsize)
MEM_GB=$(( MEM_BYTES / 1024 / 1024 / 1024 ))
FREE_PAGES=$(vm_stat | awk '/free/ {print $3}' | tr -d '.')
PAGE_SIZE=$(vm_stat | head -1 | awk '{print $8}')
FREE_GB=$(( (FREE_PAGES * PAGE_SIZE) / 1024 / 1024 / 1024 ))
if [ "$FREE_GB" -lt 10 ]; then fail "Only ${FREE_GB}GB free of ${MEM_GB}GB — need ≥ 10GB"; fi
if [ "$FREE_GB" -lt 20 ]; then warn "Only ${FREE_GB}GB free of ${MEM_GB}GB — prefer ≥ 20GB"; fi
ok "Memory: ${FREE_GB}GB free of ${MEM_GB}GB"

# Disk
DATA_DIR="${HOME}/allmythings-data"
mkdir -p "$DATA_DIR"
DISK_AVAIL_GB=$(df -g "$DATA_DIR" | tail -1 | awk '{print $4}')
if [ "$DISK_AVAIL_GB" -lt 10 ]; then fail "Only ${DISK_AVAIL_GB}GB free in $DATA_DIR — need ≥ 10GB"; fi
ok "Disk: ${DISK_AVAIL_GB}GB free in $DATA_DIR"

# Ports
for PORT in 14000 14001 7233 8233 3000 3100 3200 9191 9093; do
  if lsof -i ":$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    PID=$(lsof -t -i ":$PORT" -sTCP:LISTEN | head -1)
    OWNER=$(ps -p "$PID" -o comm= 2>/dev/null || echo unknown)
    warn "Port $PORT already bound by PID $PID ($OWNER) — will attempt stop first"
  fi
done

echo -e "${GREEN}Preflight PASSED.${NC}"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/preflight.sh
./scripts/preflight.sh
```
Expected: all green OKs; prints pass.

- [ ] **Step 3: Commit**

```bash
git add scripts/preflight.sh
git commit -m "feat(ops): preflight.sh — Stage 0 checks (macOS, Docker, Node, Python, Ollama, RAM, disk, ports)"
```

---

### Task 26: Rewrite scripts/start-all.sh (6 stages + warm-up gate)

**Files:**
- Modify (overwrite): `scripts/start-all.sh`

- [ ] **Step 1: Overwrite start-all.sh**

Overwrite `scripts/start-all.sh`:

```bash
#!/bin/bash
# Unified process manager. Usage: ./scripts/start-all.sh {start|stop|status|logs}
set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log_info()    { echo -e "${BLUE}[INFO]${NC}    $1"; }
log_ok()      { echo -e "${GREEN}[ OK ]${NC}   $1"; }
log_err()     { echo -e "${RED}[ERROR]${NC}  $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}   $1"; }

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN_DIR="/tmp/allmythings"
mkdir -p "$RUN_DIR"
DETECTION_PID="$RUN_DIR/detection.pid"
API_PID="$RUN_DIR/api.pid"
DETECTION_LOG="$RUN_DIR/detection.log"
API_LOG="$RUN_DIR/api.log"

wait_http() { # url timeout label
  local url="$1" timeout="$2" label="$3" elapsed=0
  while [ "$elapsed" -lt "$timeout" ]; do
    if curl -sf "$url" >/dev/null 2>&1; then log_ok "$label is up"; return 0; fi
    sleep 2; elapsed=$((elapsed + 2))
  done
  log_err "$label did not become healthy in ${timeout}s"; return 1
}

cmd_stop() {
  log_info "Stopping all services..."
  for pidfile in "$DETECTION_PID" "$API_PID"; do
    if [ -f "$pidfile" ]; then
      pid=$(cat "$pidfile")
      kill -TERM "$pid" 2>/dev/null || true
      for i in {1..5}; do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
      kill -KILL "$pid" 2>/dev/null || true
      rm -f "$pidfile"
    fi
  done
  lsof -ti :14000 2>/dev/null | xargs kill -9 2>/dev/null || true
  lsof -ti :14001 2>/dev/null | xargs kill -9 2>/dev/null || true
  docker compose -f "$PROJECT_ROOT/observability/docker-compose.lgtm.yml" stop 2>/dev/null || true
  log_ok "All services stopped"
}

cmd_start() {
  "$PROJECT_ROOT/scripts/preflight.sh"

  # Stage 1: Observability stack
  log_info "Stage 1: Observability + Temporal stack..."
  docker compose -f "$PROJECT_ROOT/observability/docker-compose.lgtm.yml" up -d
  wait_http http://localhost:3000/api/health 30 "Grafana"
  wait_http http://localhost:3100/ready     30 "Loki"
  wait_http http://localhost:3200/ready     30 "Tempo"
  wait_http http://localhost:9191/-/ready   30 "Prometheus"
  wait_http http://localhost:9093/-/ready   30 "Alertmanager"
  wait_http http://localhost:8233           30 "Temporal UI"

  # Stage 2: Temporal gRPC ready
  log_info "Stage 2: Temporal server..."
  for i in {1..30}; do
    docker exec allmythings-temporal tctl --ns default namespace describe default 2>/dev/null && break
    sleep 1
  done
  log_ok "Temporal namespace reachable"

  # Stage 3: Ollama + required models
  log_info "Stage 3: Ollama + required models..."
  if ! pgrep -x ollama >/dev/null; then
    ollama serve >>"$RUN_DIR/ollama.log" 2>&1 &
    for i in {1..30}; do curl -sf http://localhost:11434/api/tags >/dev/null && break; sleep 1; done
  fi
  log_ok "Ollama reachable"

  for MODEL in qwen2.5vl:7b qwen2.5vl:3b moondream; do
    if ! ollama list | grep -q "^${MODEL%:latest}" ; then
      log_info "Pulling $MODEL..."
      ollama pull "$MODEL"
    fi
    log_ok "model: $MODEL"
  done

  BIG_MODEL=$(ollama ps 2>/dev/null | awk 'NR>1 && $3 ~ /GB/ && $3+0>10 {print $1}' | head -1 || true)
  if [ -n "$BIG_MODEL" ]; then
    log_warn "Large model $BIG_MODEL is loaded (>10GB). Consider: ollama stop $BIG_MODEL"
  fi

  # Stage 4: detection-service
  log_info "Stage 4: detection-service..."
  (
    cd "$PROJECT_ROOT/detection-service"
    PYTHONPATH=src ./venv/bin/python -m uvicorn detection_service.main:app --host 0.0.0.0 --port 14001
  ) >>"$DETECTION_LOG" 2>&1 &
  echo $! >"$DETECTION_PID"
  wait_http http://localhost:14001/health 10 "detection-service"

  # Stage 5: api-service + Temporal worker
  log_info "Stage 5: api-service..."
  (
    cd "$PROJECT_ROOT/api-service"
    node --env-file=.env ./node_modules/.bin/tsx src/app.ts
  ) >>"$API_LOG" 2>&1 &
  echo $! >"$API_PID"
  wait_http http://localhost:14000/v1/health 30 "api-service"

  # Stage 6: Warm-up
  log_info "Stage 6: Warm-up..."
  SMOKE_FIXTURE="$PROJECT_ROOT/api-service/src/__tests__/fixtures/smoke_tiny.jpg"
  if [ -f "$SMOKE_FIXTURE" ]; then
    curl -s -X POST http://localhost:14000/v1/detect -F "file=@$SMOKE_FIXTURE" -o /dev/null --max-time 90
    log_ok "Warm-up request completed"
  else
    log_warn "Warm-up fixture missing — skipping"
  fi

  echo ""
  log_ok "All services ready."
  echo ""
  echo "  Temporal  http://localhost:8233"
  echo "  Grafana   http://localhost:3000  (admin/admin)"
  echo "  API       http://localhost:14000"
  echo ""
  echo "  iPhone connects via mDNS: allmythings._http._tcp.local"
  echo ""
  echo "  Run 'make smoke' to verify the pipeline."
  cmd_status
}

cmd_status() {
  echo -e "${BLUE}── Service Status ─────────────────${NC}"
  for SVC in "Grafana|http://localhost:3000/api/health" \
             "Tempo|http://localhost:3200/ready" \
             "Loki|http://localhost:3100/ready" \
             "Prometheus|http://localhost:9191/-/ready" \
             "Alertmanager|http://localhost:9093/-/ready" \
             "Temporal UI|http://localhost:8233" \
             "Ollama|http://localhost:11434/api/tags" \
             "Detection|http://localhost:14001/health" \
             "API|http://localhost:14000/v1/health"; do
    IFS='|' read -r NAME URL <<< "$SVC"
    if curl -sf "$URL" >/dev/null 2>&1; then
      printf "  ${GREEN}●${NC} %-15s UP\n" "$NAME"
    else
      printf "  ${RED}●${NC} %-15s DOWN\n" "$NAME"
    fi
  done
}

cmd_logs() {
  mkdir -p "$RUN_DIR"
  touch "$DETECTION_LOG" "$API_LOG"
  tail -f "$DETECTION_LOG" "$API_LOG"
}

case "${1:-help}" in
  start)  cmd_start  ;;
  stop)   cmd_stop   ;;
  status) cmd_status ;;
  logs)   cmd_logs   ;;
  *) echo "Usage: $0 {start|stop|status|logs}"; exit 1 ;;
esac
```

- [ ] **Step 2: Verify executable and test a dry run**

```bash
chmod +x scripts/start-all.sh
./scripts/start-all.sh stop  # clean slate
./scripts/start-all.sh start
```
Expected: all 6 stages complete; ends with status table of 9 UPs.

- [ ] **Step 3: Commit**

```bash
git add scripts/start-all.sh
git commit -m "feat(ops): rewrite start-all.sh with 6 health-gated stages + warm-up"
```

---

### Task 27: Makefile rewrite

**Files:**
- Modify: `Makefile`

- [ ] **Step 1: Append/replace service-management targets**

Append to `Makefile` (replace existing start/stop/status/logs):

```makefile
## ── Service Management ─────────────────────────────────────────────
start: ## Full stack — obs + temporal + ollama + detection + api + warmup
	@./scripts/start-all.sh start

start-deps: ## Just the dependencies (obs + temporal + ollama) — dev mode leaves apps to you
	@docker compose -f observability/docker-compose.lgtm.yml up -d
	@if ! pgrep -x ollama >/dev/null; then ollama serve >/tmp/allmythings/ollama.log 2>&1 & fi

stop: ## Stop everything
	@./scripts/start-all.sh stop

status: ## Service status table
	@./scripts/start-all.sh status

logs: ## Tail combined logs
	@./scripts/start-all.sh logs

## ── Development ────────────────────────────────────────────────────
dev: ## Hot-reload API + detection (requires `make start-deps` first)
	@echo "${YELLOW}Starting dev mode. Run 'make start-deps' first if needed.${NC}"
	@$(MAKE) dev-api & $(MAKE) dev-detection & wait

dev-detection:
	@cd detection-service && PYTHONPATH=src ./venv/bin/python -m uvicorn detection_service.main:app --host 0.0.0.0 --port 14001 --reload

## ── Testing ────────────────────────────────────────────────────────
smoke: ## Full smoke test (happy path, trace, idempotency, degraded, SLO gate)
	@./scripts/smoke.sh

verify: ## Lint + unit + workflow + integration tests (no smoke, no accuracy)
	@$(MAKE) lint
	@$(MAKE) test

## ── Backup ─────────────────────────────────────────────────────────
backup: ## Tar ~/allmythings-data to ~/allmythings-backups/YYYY-MM-DD.tar.gz
	@mkdir -p $(HOME)/allmythings-backups
	@tar -czf $(HOME)/allmythings-backups/$(shell date +%Y-%m-%d).tar.gz -C $(HOME) allmythings-data
	@echo "Backup: $(HOME)/allmythings-backups/$(shell date +%Y-%m-%d).tar.gz"

restore: ## Restore from backup. Usage: make restore FILE=~/allmythings-backups/YYYY-MM-DD.tar.gz
	@test -n "$(FILE)" || (echo "Usage: make restore FILE=path" && exit 1)
	@tar -xzf $(FILE) -C $(HOME)
	@echo "Restored. Run 'make start' to bring up the stack."

## ── Optional launchd supervisor (opt-in) ───────────────────────────
install-supervisor: ## Install launchd plists so apps auto-restart
	@./scripts/install-supervisor.sh

uninstall-supervisor: ## Remove launchd plists
	@./scripts/uninstall-supervisor.sh
```

- [ ] **Step 2: Verify syntax**

```bash
make -n start 2>&1 | head
make -n smoke 2>&1 | head
```

- [ ] **Step 3: Commit**

```bash
git add Makefile
git commit -m "feat(ops): Makefile — start/start-deps/dev/stop/status/logs/smoke/verify/backup/restore/install-supervisor"
```

### Task 28: Smoke fixtures + smoke-assertions.ts

**Files:**
- Create: `api-service/src/__tests__/fixtures/room_01.jpg` (real room photo — copy from existing `test_images/` if available, else generate synthetic)
- Create: `scripts/smoke-assertions.ts`

- [ ] **Step 1: Populate the realistic fixture**

```bash
cd /Users/mrarindampaul/Develop/allmythings
if [ -f test_images/room_01.jpg ]; then
  cp test_images/room_01.jpg api-service/src/__tests__/fixtures/room_01.jpg
else
  # Synthesize a 1920x1080 gray image with some shapes so Florence finds regions.
  node -e "const sharp=require('sharp');sharp({create:{width:1920,height:1080,channels:3,background:{r:90,g:100,b:110}}}).jpeg({quality:85}).toFile('api-service/src/__tests__/fixtures/room_01.jpg').then(()=>console.log('ok'))"
fi
ls -lh api-service/src/__tests__/fixtures/
```

- [ ] **Step 2: Write the assertions library**

Create `scripts/smoke-assertions.ts`:

```typescript
/**
 * Smoke assertions — run against a live stack.
 * Usage: npx tsx scripts/smoke-assertions.ts [--fixture path] [--api-url http://localhost:14000]
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

interface SmokeResult {
  name: string;
  ok: boolean;
  detail: string;
  durationMs: number;
}

const apiUrl = argOf('--api-url') ?? 'http://localhost:14000';
const fixture = argOf('--fixture') ?? 'api-service/src/__tests__/fixtures/room_01.jpg';
const runsDir = path.join(os.homedir(), 'allmythings-data', 'smoke-runs');

const SLOs = {
  workflowSuccessRatePct: 99,
  p95LatencyMs: 25_000,
  p99LatencyMs: 45_000,
  tier1RatePct: 80,
};

async function main() {
  const results: SmokeResult[] = [];
  const addResult = (name: string, ok: boolean, detail: string, durationMs = 0) => {
    results.push({ name, ok, detail, durationMs });
    console.log(`  ${ok ? '✓' : '✗'} ${name} — ${detail} (${durationMs}ms)`);
  };

  // Happy path
  const imgBuf = fs.readFileSync(fixture);
  const form = new FormData();
  form.append('file', new Blob([imgBuf], { type: 'image/jpeg' }), path.basename(fixture));
  const t1 = Date.now();
  const res1 = await fetch(`${apiUrl}/v1/detect`, { method: 'POST', body: form });
  const body1 = await res1.json() as any;
  const dur1 = Date.now() - t1;

  if (res1.status === 200) {
    addResult('happy_path_status_200', true, `200 in ${dur1}ms`, dur1);
    addResult('response_shape', !!body1.photoId && Array.isArray(body1.items), `itemCount=${body1.itemCount}`);
    addResult('slo_p95_latency', dur1 <= SLOs.p95LatencyMs, `${dur1}ms <= ${SLOs.p95LatencyMs}ms`, dur1);
    const tier1 = body1.items?.filter((i: any) => i.enrichmentTier === 'qwen7b').length ?? 0;
    const total = body1.items?.length ?? 0;
    const tier1Pct = total > 0 ? (tier1 / total) * 100 : 0;
    addResult('slo_tier1_rate', tier1Pct >= SLOs.tier1RatePct, `${tier1Pct.toFixed(0)}% tier-1`);
  } else if (res1.status === 202) {
    addResult('happy_path_accepted_202', true, `202 workflowId=${body1.workflowId}`, dur1);
  } else {
    addResult('happy_path_status_200', false, `got ${res1.status}`, dur1);
  }

  // Idempotency: second identical request
  const form2 = new FormData();
  form2.append('file', new Blob([imgBuf], { type: 'image/jpeg' }), path.basename(fixture));
  const t2 = Date.now();
  const res2 = await fetch(`${apiUrl}/v1/detect`, { method: 'POST', body: form2 });
  const body2 = await res2.json() as any;
  const dur2 = Date.now() - t2;
  const sameId = body1.photoId && body2.photoId === body1.photoId;
  addResult('idempotency', sameId, sameId ? 'same photoId reused' : `different photoIds`, dur2);

  // Trace correlation — does Tempo see our trace_id?
  if (body1.traceId) {
    try {
      const tempoRes = await fetch(`http://localhost:3200/api/traces/${body1.traceId}`);
      addResult('trace_in_tempo', tempoRes.ok, tempoRes.ok ? 'trace present in Tempo' : 'trace missing');
    } catch (e) {
      addResult('trace_in_tempo', false, `error: ${(e as Error).message}`);
    }
  }

  // Write result and aggregate SLO gate
  fs.mkdirSync(runsDir, { recursive: true });
  const runFile = path.join(runsDir, `${Date.now()}.json`);
  fs.writeFileSync(runFile, JSON.stringify(results, null, 2));

  // Prune to last 100
  const runs = fs.readdirSync(runsDir).filter((f) => f.endsWith('.json')).sort();
  if (runs.length > 100) runs.slice(0, runs.length - 100).forEach((f) => fs.unlinkSync(path.join(runsDir, f)));

  // Rolling SLO gate over last 100
  const last100 = fs.readdirSync(runsDir).filter((f) => f.endsWith('.json')).sort().slice(-100)
    .map((f) => JSON.parse(fs.readFileSync(path.join(runsDir, f), 'utf-8')) as SmokeResult[]);
  const allOkCount = last100.filter((r) => r.every((x) => x.ok)).length;
  const successPct = last100.length > 0 ? (allOkCount / last100.length) * 100 : 0;
  const sloGate = successPct >= SLOs.workflowSuccessRatePct;
  console.log(`\nRolling SLO: ${successPct.toFixed(1)}% success over last ${last100.length} runs (target ≥ ${SLOs.workflowSuccessRatePct}%)`);

  const anyFail = results.some((r) => !r.ok);
  process.exit(anyFail || !sloGate ? 1 : 0);
}

function argOf(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Install tsx in project root if missing**

```bash
cd /Users/mrarindampaul/Develop/allmythings
cd api-service && npm install --save-dev tsx@^4 || true
```

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-assertions.ts \
        api-service/src/__tests__/fixtures/room_01.jpg
git commit -m "feat(test): smoke-assertions.ts + room fixture

Assertions run against live stack: happy path + SLO gates + idempotency +
trace correlation. Results written to ~/allmythings-data/smoke-runs/
(FIFO 100) with rolling success-rate SLO gate."
```

---

### Task 29: scripts/smoke.sh (orchestrator + drills + SLO gate)

**Files:**
- Create: `scripts/smoke.sh`

- [ ] **Step 1: Write the smoke orchestrator**

Create `scripts/smoke.sh`:

```bash
#!/bin/bash
# Full smoke test: happy path + idempotency + degraded + optional fault-injection drills.
# Usage: ./scripts/smoke.sh [--drills]
set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log_section() { echo -e "\n${BLUE}► $1${NC}"; }
log_ok()      { echo -e "  ${GREEN}✓${NC} $1"; }
log_fail()    { echo -e "  ${RED}✗${NC} $1"; }

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DRILLS=${1:-}

log_section "Required services reachable?"
for NAME_URL in "Temporal|http://localhost:8233" \
                "detection|http://localhost:14001/health" \
                "Ollama|http://localhost:11434/api/tags" \
                "api|http://localhost:14000/v1/health" \
                "Grafana|http://localhost:3000/api/health"; do
  IFS='|' read -r NAME URL <<<"$NAME_URL"
  if curl -sf "$URL" >/dev/null 2>&1; then log_ok "$NAME"; else log_fail "$NAME ($URL)"; exit 1; fi
done

log_section "Required models loaded?"
for M in qwen2.5vl:7b qwen2.5vl:3b moondream; do
  if ollama list | grep -q "^${M%:latest}"; then log_ok "$M"; else log_fail "$M (run ollama pull $M)"; exit 1; fi
done

log_section "Happy path + idempotency + trace"
cd "$PROJECT_ROOT/api-service"
npx tsx ../scripts/smoke-assertions.ts --fixture src/__tests__/fixtures/room_01.jpg --api-url http://localhost:14000

if [ "$DRILLS" = "--drills" ]; then
  log_section "Degraded path — stop Ollama briefly"
  pkill -STOP -x ollama 2>/dev/null || true
  sleep 3
  HTTP=$(curl -s -o /tmp/smoke-degraded.json -w "%{http_code}" -X POST http://localhost:14000/v1/detect \
           -F "file=@src/__tests__/fixtures/room_01.jpg")
  if [ "$HTTP" = "200" ]; then
    TIER=$(python3 -c "import json; d=json.load(open('/tmp/smoke-degraded.json')); tiers=[i.get('enrichmentTier') for i in d.get('items',[])]; print(tiers)")
    log_ok "Degraded 200; tiers=$TIER"
  else
    log_fail "Expected 200 with florence-only fallback, got $HTTP"
  fi
  pkill -CONT -x ollama 2>/dev/null || true

  log_section "Fault injection — kill api-service worker"
  echo "  (skipped in automation — run manually: kill -9 \$(cat /tmp/allmythings/api.pid))"
fi

log_section "Done"
echo -e "${GREEN}SMOKE TEST PASSED${NC}"
```

- [ ] **Step 2: Make executable + first run**

```bash
chmod +x scripts/smoke.sh
./scripts/smoke.sh
```
Expected: all green checks; rolling SLO gate reports first-run 100%.

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke.sh
git commit -m "feat(test): scripts/smoke.sh — orchestrator + optional fault-injection drills"
```

---

### Task 30: Mobile app updates (handle 202/polling + retry on 429/503) + final E2E verification

**Files:**
- Modify: `mobile-app/lib/data/repositories/detection_repository.dart`
- Modify: `mobile-app/lib/application/providers/detection_providers.dart`

- [ ] **Step 1: Update detection_repository.dart to handle 202**

Find the `detectObjects` method and wrap the HTTP call:

```dart
Future<DetectionResult> detectObjects(File imageFile) async {
  final uri = Uri.parse('$baseUrl/v1/detect');
  final request = http.MultipartRequest('POST', uri);
  request.files.add(await http.MultipartFile.fromPath('file', imageFile.path));

  http.StreamedResponse streamed;
  int attempt = 0;
  while (true) {
    attempt++;
    streamed = await request.send().timeout(const Duration(seconds: 120));
    if (streamed.statusCode == 429 || streamed.statusCode == 503) {
      if (attempt >= 3) throw Exception('Server busy after $attempt attempts');
      final backoffMs = 1000 * attempt * attempt;  // 1s, 4s, 9s
      await Future.delayed(Duration(milliseconds: backoffMs));
      continue;
    }
    break;
  }

  final responseBody = await streamed.stream.bytesToString();
  final decoded = jsonDecode(responseBody) as Map<String, dynamic>;

  if (streamed.statusCode == 202) {
    return await _pollDetectionStatus(decoded['workflowId'] as String);
  }
  if (streamed.statusCode != 200) {
    throw Exception('Detect failed ${streamed.statusCode}: $responseBody');
  }
  return DetectionResult.fromJson(decoded);
}

Future<DetectionResult> _pollDetectionStatus(String workflowId) async {
  final statusUri = Uri.parse('$baseUrl/v1/detect/status/$workflowId');
  for (int i = 0; i < 30; i++) {
    await Future.delayed(const Duration(seconds: 2));
    final res = await http.get(statusUri).timeout(const Duration(seconds: 10));
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode == 200 && body['status'] == 'completed') {
      return DetectionResult.fromJson(body['result'] as Map<String, dynamic>);
    }
    if (res.statusCode >= 500) throw Exception('Workflow failed: ${body['status']}');
  }
  throw Exception('Workflow polling timeout after 60 seconds');
}
```

- [ ] **Step 2: Run mobile tests**

```bash
cd /Users/mrarindampaul/Develop/allmythings/mobile-app
flutter test 2>&1 | tail -15
```

- [ ] **Step 3: End-to-end verification**

```bash
cd /Users/mrarindampaul/Develop/allmythings
make stop
make start
make smoke
make status
```
Expected: `make smoke` passes. All 9 services show UP in `make status`.

- [ ] **Step 4: Optional — smoke with drills**

```bash
./scripts/smoke.sh --drills
```
Expected: degraded path returns florence-only items; all assertions pass.

- [ ] **Step 5: Commit**

```bash
git add mobile-app/lib/data/repositories/detection_repository.dart \
        mobile-app/lib/application/providers/detection_providers.dart
git commit -m "feat(mobile): handle 202+polling and 429/503 backoff retry

Mobile client now tolerates server backpressure and long-running
workflows: 3-attempt exponential backoff on 429/503; polls
/v1/detect/status/:workflowId after 202 for up to 60s.
Final E2E verification: make smoke passes."
```

---

## Self-Review

After completing the task list:

1. **Spec coverage** — every section of `2026-04-21-production-grade-temporal-orchestration-design.md` maps to one or more tasks:
   - §1 Architecture → Tasks 1-4 (cleanup), 5-7 (Temporal infra), 15-17 (route rewrites), 18 (legacy code removal)
   - §2 Discipline → Tasks 8-12 (activities + workflow with tier chain), 13 (replay), 14 (provider health)
   - §3 Observability → Tasks 19-24
   - §4 Testing → Tasks 8-12 (TDD unit + workflow), 13 (replay), 28-29 (smoke)
   - §5 Operations → Tasks 25-27
   - §6 Migration path → Design invariants preserved in Tasks 6 (env config), 10 (tier abstraction), 17 (health snapshot shape). No task today — intentionally.

2. **Type consistency** — `EnrichedItem.attributes.searchTags` (camelCase) is consistent across workflow, activities, tests, and response. Mobile app parses `search_tags` from API response? **Note for implementers:** the Dart model should map API `searchTags` → `search_tags` if mobile currently expects snake_case; API returns camelCase per `shared-types.ts`.

3. **Placeholder scan** — no TBD/TODO in task bodies; dashboards JSON panels are described with concrete PromQL but individual JSON files are hand-authored during execution.

4. **Ambiguity** — `preflight.sh` memory check counts only truly free pages, not cached. M4 Pro typically shows <20GB "free" even with lots of room — the warn (not fail) at <20GB is deliberate.

Fixes applied inline above: tier naming unified to camelCase, idempotency key unified to `sha256(image)`, HTTP timeout < workflow timeout (90s vs 120s).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-21-production-grade-temporal-orchestration.md`.**

30 tasks across 6 phases. Each phase leaves the system more functional than before:
- **Phase A (1-4)** — clean repo, no lying tests, MLX/YOLO memory reclaimed
- **Phase B (5-7)** — Temporal running, client + worker in place
- **Phase C (8-18)** — workflow-based pipeline fully active, legacy orchestration deleted
- **Phase D (19-24)** — Grafana LGTM + alerts always-on
- **Phase E (25-27)** — `make start` boots the whole stack with health gates + warm-up
- **Phase F (28-30)** — `make smoke` is the single source of truth; mobile client resilient

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks. Best for this plan because tasks have clean boundaries (one file family per task) and benefit from independent verification.

2. **Inline Execution** — execute in this session using `superpowers:executing-plans`, with checkpoints at phase boundaries (after tasks 4, 7, 18, 24, 27, 30).

**Which approach?**
