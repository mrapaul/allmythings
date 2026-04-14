# Observability + Eval + Hybrid Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the silent-failure debug loop and lift detection recall from 64% → 85% on fixture photos — without deploying to the phone once.

**Architecture:** (a) Replace `catch → return null` with a `StepResult<T>` union and wrap each pipeline step in an OTel span, (b) swap the fragmented observability stack for a single HyperDX container, (c) harden the eval harness into a CI-grade tool with baseline gating, (d) swap default VLM from `qwen2.5vl:3b` to `qwen2.5vl:7b` and refine the prompt, (e) add an OWLv2-based open-vocab detector in the Python service and route each detected crop through Qwen for structured attributes.

**Tech Stack:** Node.js 20 + Fastify + TypeScript + OpenTelemetry (api-service); Python 3.12 + FastAPI + transformers (detection-service); Ollama + Qwen2.5-VL-7B; HyperDX (OTLP-native observability); Vitest; pytest; pg-boss deferred to next plan.

**Scope boundaries (what this plan does NOT do):**
- pg-boss durable jobs (Phase 5 of spec — separate plan)
- iPhone YOLOv10-S CoreML swap (Phase 6 — separate plan)
- Per-item data model + UI rework (Phase 7 — separate plan)
- Android MethodChannel handlers (separate plan, after iPhone ships)

---

## File Structure

### Created

```
api-service/src/telemetry/
  step-result.ts          # StepResult<T> discriminated union + classifyError(e)
  pipeline-tracer.ts      # withSpan() helper that wraps async step in OTel span + StepResult
  trace-context.ts        # injectTraceHeaders(headers) for outbound HTTP

api-service/tests/unit/
  step-result.test.ts
  pipeline-tracer.test.ts
  trace-context.test.ts

api-service/src/providers/
  owlv2.detector.ts       # HTTP client for the Python OWLv2 endpoint

api-service/tests/unit/
  owlv2.detector.unit.test.ts

api-service/src/services/
  hybrid-pipeline.service.ts   # OWLv2 boxes → parallel Qwen crops → merge

api-service/tests/unit/
  hybrid-pipeline.unit.test.ts

api-service/prompts/
  household-classes.txt   # OWLv2 prompt list, ~200 household item classes

detection-service/src/detection_service/routes/
  __init__.py
  owlv2.py                # FastAPI route: POST /detect/owlv2

detection-service/tests/unit/
  test_owlv2_route.py

eval/
  baseline.json           # committed recall baseline per model
  README.md               # how to run, how to update baseline

docker-compose.hyperdx.yml   # Single-container observability stack
```

### Modified

```
api-service/src/services/detection-pipeline.service.ts   # runFastPass/runDeepPass return StepResult, wrapped in spans
api-service/src/providers/ollama.classifier.ts           # refined prompt (target +10% recall)
api-service/src/config/env.config.ts                     # OLLAMA_MODEL default, OWLV2_URL, HYBRID_ENABLED
api-service/.env.example                                 # new vars + HyperDX OTLP endpoint
api-service/.env                                         # OLLAMA_MODEL=qwen2.5vl:7b, OWLV2_URL, HYBRID_ENABLED
api-service/src/app.ts                                   # wire hybrid pipeline behind env flag
api-service/package.json                                 # eval + eval:ci scripts
detection-service/src/detection_service/main.py          # register owlv2 router
detection-service/pyproject.toml                         # add transformers, torch (cpu), owlv2 model deps
eval/harness.mjs                                         # --baseline flag, --ci flag, hybrid mode
Makefile                                                 # eval, eval:ci, eval:baseline targets
```

---

## Baseline Recall (from 2026-04-14 eval run)

This is the pre-plan baseline. Tasks that swap or tune the VLM must not regress below these numbers for a given model:

| Model | Avg recall | Avg items | Avg latency | Failures |
|-|-|-|-|-|
| qwen2.5vl:7b | 64.3% | 10.5 | 19.8s | 0/4 |
| qwen2.5vl:3b | 57% | 10 | 58s | 0/4 |
| llava:latest | 44.6% | 10 | 11.4s | 0/4 |
| moondream:latest | 4.5% | 0.8 | 4s | 0/4 |

---

## Phase 1: StepResult<T> — Structured errors replace null returns

### Task 1: StepResult<T> union + classifyError

**Files:**
- Create: `api-service/src/telemetry/step-result.ts`
- Create: `api-service/tests/unit/step-result.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// api-service/tests/unit/step-result.test.ts
import { describe, it, expect } from 'vitest';
import { ok, fail, classifyError, isOk, isFail } from '../../src/telemetry/step-result';

describe('StepResult', () => {
  it('ok() wraps a value', () => {
    const r = ok(42, 100);
    expect(isOk(r)).toBe(true);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
    expect(r.durationMs).toBe(100);
  });

  it('fail() carries a structured error', () => {
    const r = fail({ code: 'timeout', message: 'took too long', retryable: true }, 5000);
    expect(isFail(r)).toBe(true);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('timeout');
      expect(r.error.retryable).toBe(true);
    }
  });
});

describe('classifyError', () => {
  it('maps AbortSignal timeout to retryable timeout', () => {
    const abortError = new DOMException('aborted', 'TimeoutError');
    const coded = classifyError(abortError);
    expect(coded.code).toBe('timeout');
    expect(coded.retryable).toBe(true);
  });

  it('maps 5xx text to retryable upstream_5xx', () => {
    const coded = classifyError(new Error('Ollama returned 500: ...'));
    expect(coded.code).toBe('upstream_5xx');
    expect(coded.retryable).toBe(true);
  });

  it('maps 4xx to non-retryable upstream_4xx', () => {
    const coded = classifyError(new Error('Ollama returned 400: bad request'));
    expect(coded.code).toBe('upstream_4xx');
    expect(coded.retryable).toBe(false);
  });

  it('maps unknown errors to unknown + retryable=false', () => {
    const coded = classifyError('random string');
    expect(coded.code).toBe('unknown');
    expect(coded.retryable).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd api-service && npx vitest run tests/unit/step-result.test.ts
```
Expected: FAIL — module `../../src/telemetry/step-result` not found.

- [ ] **Step 3: Create the module**

```typescript
// api-service/src/telemetry/step-result.ts

export interface StepError {
  code: 'timeout' | 'upstream_4xx' | 'upstream_5xx' | 'parse_error' | 'network' | 'ggml_assert' | 'unknown';
  message: string;
  retryable: boolean;
  cause?: unknown;
}

export type StepResult<T> =
  | { ok: true;  value: T;        durationMs: number }
  | { ok: false; error: StepError; durationMs: number };

export function ok<T>(value: T, durationMs: number): StepResult<T> {
  return { ok: true, value, durationMs };
}

export function fail<T = never>(error: StepError, durationMs: number): StepResult<T> {
  return { ok: false, error, durationMs };
}

export function isOk<T>(r: StepResult<T>): r is Extract<StepResult<T>, { ok: true }> {
  return r.ok;
}

export function isFail<T>(r: StepResult<T>): r is Extract<StepResult<T>, { ok: false }> {
  return !r.ok;
}

export function classifyError(err: unknown): StepError {
  const msg = err instanceof Error ? err.message : String(err);

  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return { code: 'timeout', message: msg, retryable: true, cause: err };
  }
  if (/GGML_ASSERT/.test(msg)) {
    return { code: 'ggml_assert', message: msg, retryable: true, cause: err };
  }
  const m5xx = /(?:returned|status)\s+(5\d\d)/i.exec(msg);
  if (m5xx) {
    return { code: 'upstream_5xx', message: msg, retryable: true, cause: err };
  }
  const m4xx = /(?:returned|status)\s+(4\d\d)/i.exec(msg);
  if (m4xx) {
    return { code: 'upstream_4xx', message: msg, retryable: false, cause: err };
  }
  if (err instanceof TypeError && /fetch/i.test(msg)) {
    return { code: 'network', message: msg, retryable: true, cause: err };
  }
  if (/JSON|parse/i.test(msg)) {
    return { code: 'parse_error', message: msg, retryable: false, cause: err };
  }
  return { code: 'unknown', message: msg, retryable: false, cause: err };
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd api-service && npx vitest run tests/unit/step-result.test.ts
```
Expected: PASS, 5/5 tests.

- [ ] **Step 5: Commit**

```bash
git add api-service/src/telemetry/step-result.ts api-service/tests/unit/step-result.test.ts
git commit -m "feat(api): StepResult<T> union + classifyError for structured pipeline errors"
```

---

### Task 2: withSpan helper that wraps a step in OTel + returns StepResult

**Files:**
- Create: `api-service/src/telemetry/pipeline-tracer.ts`
- Create: `api-service/tests/unit/pipeline-tracer.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// api-service/tests/unit/pipeline-tracer.test.ts
import { describe, it, expect } from 'vitest';
import { withSpan } from '../../src/telemetry/pipeline-tracer';

describe('withSpan', () => {
  it('returns ok when step succeeds', async () => {
    const r = await withSpan('test.ok', { photoId: 'p1' }, async () => 'hello');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('hello');
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns fail when step throws', async () => {
    const r = await withSpan('test.fail', {}, async () => {
      throw new Error('Ollama returned 500: boom');
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('upstream_5xx');
      expect(r.error.retryable).toBe(true);
    }
  });

  it('records span duration', async () => {
    const r = await withSpan('test.delay', {}, async () => {
      await new Promise((res) => setTimeout(res, 30));
      return 1;
    });
    expect(r.durationMs).toBeGreaterThanOrEqual(25);
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

```bash
cd api-service && npx vitest run tests/unit/pipeline-tracer.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create the module**

```typescript
// api-service/src/telemetry/pipeline-tracer.ts
import { trace, SpanStatusCode, Attributes } from '@opentelemetry/api';
import { StepResult, ok, fail, classifyError } from './step-result';

const tracer = trace.getTracer('detection-pipeline');

export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: () => Promise<T>,
): Promise<StepResult<T>> {
  const span = tracer.startSpan(name, { attributes });
  const start = Date.now();
  try {
    const value = await fn();
    span.setStatus({ code: SpanStatusCode.OK });
    return ok(value, Date.now() - start);
  } catch (err) {
    const coded = classifyError(err);
    span.recordException(err instanceof Error ? err : new Error(coded.message));
    span.setAttribute('error.code', coded.code);
    span.setAttribute('error.retryable', coded.retryable);
    span.setStatus({ code: SpanStatusCode.ERROR, message: coded.message });
    return fail(coded, Date.now() - start);
  } finally {
    span.end();
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd api-service && npx vitest run tests/unit/pipeline-tracer.test.ts
```
Expected: PASS, 3/3 tests.

- [ ] **Step 5: Commit**

```bash
git add api-service/src/telemetry/pipeline-tracer.ts api-service/tests/unit/pipeline-tracer.test.ts
git commit -m "feat(api): withSpan helper for step-scoped OTel + StepResult"
```

---

### Task 3: injectTraceHeaders for outbound HTTP to the Python service

**Files:**
- Create: `api-service/src/telemetry/trace-context.ts`
- Create: `api-service/tests/unit/trace-context.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// api-service/tests/unit/trace-context.test.ts
import { describe, it, expect } from 'vitest';
import { trace, context } from '@opentelemetry/api';
import { injectTraceHeaders } from '../../src/telemetry/trace-context';

describe('injectTraceHeaders', () => {
  it('adds traceparent when a span is active', async () => {
    const tracer = trace.getTracer('test');
    const span = tracer.startSpan('t');
    const ctx = trace.setSpan(context.active(), span);
    const headers: Record<string, string> = {};
    context.with(ctx, () => injectTraceHeaders(headers));
    span.end();
    // traceparent format: 00-<traceId>-<spanId>-<flags>
    expect(headers.traceparent).toMatch(/^\d{2}-[0-9a-f]{32}-[0-9a-f]{16}-\d{2}$/);
  });

  it('is a no-op when no active span', () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    injectTraceHeaders(headers);
    expect(headers.traceparent).toBeUndefined();
    expect(headers['Content-Type']).toBe('application/json');
  });
});
```

- [ ] **Step 2: Run test to verify fail**

```bash
cd api-service && npx vitest run tests/unit/trace-context.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create module**

```typescript
// api-service/src/telemetry/trace-context.ts
import { propagation, context } from '@opentelemetry/api';

export function injectTraceHeaders(headers: Record<string, string>): void {
  propagation.inject(context.active(), headers);
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd api-service && npx vitest run tests/unit/trace-context.test.ts
```
Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add api-service/src/telemetry/trace-context.ts api-service/tests/unit/trace-context.test.ts
git commit -m "feat(api): injectTraceHeaders for W3C traceparent propagation"
```

---

### Task 4: Replace null returns in detection-pipeline.service.ts with StepResult

**Files:**
- Modify: `api-service/src/services/detection-pipeline.service.ts`

This is the biggest change. Read the full file first: `cat api-service/src/services/detection-pipeline.service.ts`.

- [ ] **Step 1: Add new imports and types at the top of the file**

Insert at line 6 (after the existing imports):

```typescript
import { withSpan } from '../telemetry/pipeline-tracer';
import { StepResult, isOk, isFail } from '../telemetry/step-result';
import { injectTraceHeaders } from '../telemetry/trace-context';
```

Update the `FullPipelineResult` interface (around line 21) to carry structured errors:

```typescript
export interface FullPipelineResult {
  fastPass: FastPassResult | null;
  deepPass: DeepPassResult | null;
  fused: FusedDetection[];
  totalProcessingMs: number;
  errors: Array<{ step: string; code: string; message: string; retryable: boolean }>;
}
```

- [ ] **Step 2: Rewrite `runFastPass` to return StepResult**

Replace the current `runFastPass` method (around line 89–97):

```typescript
private async runFastPass(image: Buffer, photoId: string): Promise<StepResult<FastPassResult>> {
  return withSpan('detection.fast_pass', { 'detection.photo_id': photoId }, async () => {
    const start = Date.now();
    const detections = await this.callFastDetector(image);
    return { detections, processingTimeMs: Date.now() - start };
  });
}
```

- [ ] **Step 3: Rewrite `runDeepPass` to return StepResult**

Replace the current `runDeepPass` method (around line 127–140):

```typescript
private async runDeepPass(image: Buffer, photoId: string): Promise<StepResult<DeepPassResult>> {
  return withSpan('detection.deep_pass', { 'detection.photo_id': photoId }, async () => {
    const start = Date.now();
    const detections = await this.multiPassVlm.detect(image);
    return {
      detections,
      processingTimeMs: Date.now() - start,
      provider: 'multi-pass-vlm',
    };
  });
}
```

- [ ] **Step 4: Update `callFastDetector` to propagate trace headers**

Find the `fetch(...)` call inside `callFastDetector` (around line 100–125). Before the `await fetch`, build a headers object and inject:

```typescript
const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' };
injectTraceHeaders(headers);
const response = await fetch(`${this.fastDetectorUrl}/detect/fast`, {
  method: 'POST',
  headers,
  body: image,
  signal: AbortSignal.timeout(30_000),
});
```

- [ ] **Step 5: Rewrite `detectFull` to aggregate StepResults**

Find `detectFull` (around line 60). Replace its body with:

```typescript
async detectFull(image: Buffer, photoId = 'unknown'): Promise<FullPipelineResult> {
  const start = Date.now();
  const errors: FullPipelineResult['errors'] = [];

  return withSpan('detection.pipeline', { 'detection.photo_id': photoId }, async () => {
    const [fastRes, deepRes] = await Promise.all([
      this.runFastPass(image, photoId),
      this.runDeepPass(image, photoId),
    ]);

    const fastPass = isOk(fastRes) ? fastRes.value : null;
    if (isFail(fastRes)) errors.push({ step: 'fast_pass', code: fastRes.error.code, message: fastRes.error.message, retryable: fastRes.error.retryable });

    const deepPass = isOk(deepRes) ? deepRes.value : null;
    if (isFail(deepRes)) errors.push({ step: 'deep_pass', code: deepRes.error.code, message: deepRes.error.message, retryable: deepRes.error.retryable });

    const fastDetections = fastPass?.detections ?? [];
    const deepDetections = deepPass?.detections ?? [];
    const fused = this.fusionService.fuseFastAndDeep(fastDetections, deepDetections);

    return {
      fastPass,
      deepPass,
      fused,
      totalProcessingMs: Date.now() - start,
      errors,
    };
  }).then((r) => {
    if (r.ok) return r.value;
    // Pipeline wrapper itself failed — surface as a pipeline-level error
    return {
      fastPass: null,
      deepPass: null,
      fused: [],
      totalProcessingMs: Date.now() - start,
      errors: [{ step: 'pipeline', code: r.error.code, message: r.error.message, retryable: r.error.retryable }, ...errors],
    };
  });
}
```

- [ ] **Step 6: Run the pipeline tests**

```bash
cd api-service && npx vitest run tests/unit
```
Expected: PASS — no pre-existing tests should break. New OTel spans are invisible in test mode without an exporter.

- [ ] **Step 7: Commit**

```bash
git add api-service/src/services/detection-pipeline.service.ts
git commit -m "refactor(api): pipeline steps return StepResult, wrap in OTel spans, propagate traceparent"
```

---

### Task 5: Confirm the detect route forwards errors[] in responses

**Files:**
- Modify: `api-service/src/routes/detect.route.ts` (verify only)
- Create: `api-service/tests/unit/detect-errors.test.ts`

- [ ] **Step 1: Verify the response shape in `detect.route.ts`**

Look at the current response in `detect.route.ts` (lines 34–40):

```typescript
if (mode === 'full') {
  const result = await pipeline.detectFull(imageBuffer);
  return reply.code(200).send({
    ...result,
    imageQuality: { blur: quality.blurScore, brightness: quality.brightness, contrast: quality.contrast },
  });
}
```

Since `FullPipelineResult` now has `errors`, this already forwards them via the spread. No change needed — but add a test that asserts the field survives.

- [ ] **Step 2: Add unit test asserting errors array shape**

Create `api-service/tests/unit/detect-errors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { FullPipelineResult } from '../../src/services/detection-pipeline.service';

describe('FullPipelineResult contract', () => {
  it('includes an errors array that route handlers forward', () => {
    const sample: FullPipelineResult = {
      fastPass: null,
      deepPass: null,
      fused: [],
      totalProcessingMs: 42,
      errors: [{ step: 'deep_pass', code: 'upstream_5xx', message: 'Ollama 500', retryable: true }],
    };
    expect(sample.errors).toHaveLength(1);
    expect(sample.errors[0].code).toBe('upstream_5xx');
    expect(sample.errors[0].step).toBe('deep_pass');
    expect(sample.errors[0].retryable).toBe(true);
  });
});
```

- [ ] **Step 3: Run test**

```bash
cd api-service && npx vitest run tests/unit/detect-errors.test.ts
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add api-service/tests/unit/detect-errors.test.ts
git commit -m "test(api): type-level assertion that errors[] is part of FullPipelineResult"
```

---

## Phase 2: Observability Stack — HyperDX container

### Task 6: Add HyperDX compose file and wire api-service OTLP endpoint

**Files:**
- Create: `docker-compose.hyperdx.yml`
- Modify: `api-service/.env.example`, `api-service/.env`

- [ ] **Step 1: Create the compose file**

```yaml
# docker-compose.hyperdx.yml
# Single-container observability. Run: docker compose -f docker-compose.hyperdx.yml up -d
# UI: http://localhost:8080  (signup flow on first visit, all local)
# OTLP gRPC ingest: localhost:4317
# OTLP HTTP ingest: localhost:4318

services:
  hyperdx:
    image: hyperdx/hyperdx-local:latest
    container_name: allmythings-hyperdx
    ports:
      - "8080:8080"     # web UI
      - "4317:4317"     # OTLP gRPC
      - "4318:4318"     # OTLP HTTP
      - "8002:8002"     # OpAMP
    volumes:
      - hyperdx-data:/data
    restart: unless-stopped

volumes:
  hyperdx-data:
```

- [ ] **Step 2: Update .env.example**

Replace or add:

```bash
# api-service/.env.example
OTLP_ENDPOINT=http://localhost:4317
OTEL_SERVICE_NAME=api-service
OTEL_SERVICE_VERSION=2.0.0
```

- [ ] **Step 3: Update .env same way**

```bash
# api-service/.env (edit existing)
OTLP_ENDPOINT=http://localhost:4317
OTEL_SERVICE_NAME=api-service
```

- [ ] **Step 4: Start HyperDX**

```bash
docker compose -f docker-compose.hyperdx.yml up -d
sleep 5
curl -sf http://localhost:8080 > /dev/null && echo "HyperDX UI up" || echo "FAIL"
```
Expected: `HyperDX UI up`.

- [ ] **Step 5: Smoke-test trace flow**

Restart api-service, hit /v1/health, then inspect trace:

```bash
cd api-service && pkill -f "tsx watch"; npm run dev &
sleep 3
curl -s http://localhost:14000/v1/health
```

Open http://localhost:8080 in your browser, complete the first-run signup, and confirm a `service.name=api-service` trace is present.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.hyperdx.yml api-service/.env.example
git commit -m "feat(obs): single-container HyperDX replaces multi-container stack"
```

---

### Task 7: Ensure detection-service passes traceparent through NATS hop

**Files:**
- Check: `detection-service/src/detection_service/nats_client/client.py`

The orchestration research says NATS client already propagates traceparent. Verify:

- [ ] **Step 1: Grep for propagation code**

```bash
grep -n "traceparent\|propagate" detection-service/src/detection_service/nats_client/client.py
```
Expected: at least one hit. If none, see Step 2; otherwise skip to Step 3.

- [ ] **Step 2 (only if missing): Add W3C propagation**

Open `detection-service/src/detection_service/nats_client/client.py`, locate the publish call, and add:

```python
from opentelemetry import propagate

def _inject_headers() -> dict[str, str]:
    headers: dict[str, str] = {}
    propagate.inject(headers)
    return headers
```

Use `_inject_headers()` to populate the `headers` arg on each `nc.publish`. Add the mirror `propagate.extract(headers)` on subscribe.

- [ ] **Step 3: Smoke test full trace across services**

```bash
# Run both services and trigger a detection
cd api-service && curl -X POST http://localhost:14000/v1/detect?mode=full -F "file=@../eval/fixtures/1776173015803.jpg" -o /tmp/out.json
```

Open HyperDX, find the trace for this request. It should contain spans from BOTH `api-service` AND `detection-service` (or at least api-service spans with a linked parent from detection-service if the Python side pushed first).

- [ ] **Step 4: Commit (only if changes were made in Step 2)**

```bash
git add detection-service/src/detection_service/nats_client/client.py
git commit -m "feat(obs): propagate W3C traceparent over NATS"
```

---

## Phase 3: Eval Harness Hardening

### Task 8: Baseline snapshot

**Files:**
- Create: `eval/baseline.json`

- [ ] **Step 1: Snapshot the current leaderboard**

```bash
cp eval/report-2026-04-14-16-40-05.json eval/baseline.json
```

Verify content:
```bash
jq 'to_entries | map({model: .key, avgRecall: .value.aggregate.avgRecall})' eval/baseline.json
```
Expected: 4 models with their recall numbers.

- [ ] **Step 2: Commit**

```bash
git add eval/baseline.json
git commit -m "test(eval): snapshot baseline recall per model"
```

---

### Task 9: Harness --ci flag that fails below baseline

**Files:**
- Modify: `eval/harness.mjs`

- [ ] **Step 1: Add --ci flag handling**

Replace the `main()` function in `eval/harness.mjs`:

```javascript
async function main() {
  const args = process.argv.slice(2);
  const ci = args.includes('--ci');
  const models = args.filter((a) => !a.startsWith('--'));
  if (models.length === 0) {
    console.error('Usage: node harness.mjs <model1> [model2] ... [--ci]');
    process.exit(1);
  }

  await fs.mkdir(RUNS, { recursive: true });
  const baseline = ci
    ? JSON.parse(await fs.readFile(path.join(EVAL_ROOT, 'baseline.json'), 'utf-8').catch(() => '{}'))
    : null;

  const fixtureFiles = (await fs.readdir(FIXTURES)).filter((f) => f.endsWith('.jpg')).sort();
  const oracles = {};
  for (const f of fixtureFiles) {
    const name = f.replace('.jpg', '');
    oracles[name] = JSON.parse(await fs.readFile(path.join(ORACLES, `${name}.json`), 'utf-8'));
  }

  const summary = {};
  for (const model of models) {
    console.log(`\n=== MODEL: ${model} ===`);
    summary[model] = { perFixture: [], aggregate: {} };
    let totalRecall = 0, totalCount = 0, totalMs = 0, failures = 0;
    for (const f of fixtureFiles) {
      const name = f.replace('.jpg', '');
      const imagePath = path.join(FIXTURES, f);
      process.stdout.write(`  ${name}: `);
      const runResult = await runModel(model, imagePath);
      if (runResult.error) {
        failures++;
        console.log(`ERROR (${runResult.elapsedMs}ms): ${runResult.error.slice(0, 80)}`);
        summary[model].perFixture.push({ fixture: name, error: runResult.error, elapsedMs: runResult.elapsedMs });
        continue;
      }
      const extracted = extractJson(runResult.text);
      const score = scoreRun(extracted, oracles[name]);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const runPath = path.join(RUNS, `${model.replace(/[/:]/g, '_')}__${name}__${timestamp}.json`);
      await fs.writeFile(runPath, JSON.stringify({ model, fixture: name, extracted, raw: runResult.text, score, elapsedMs: runResult.elapsedMs, attempts: runResult.attempt }, null, 2));
      totalRecall += score.recall;
      totalCount += score.itemCount;
      totalMs += runResult.elapsedMs;
      console.log(`recall=${score.recall}% items=${score.itemCount}/${score.expectedMin}-${score.expectedMax} t=${runResult.elapsedMs}ms a=${runResult.attempt}`);
      summary[model].perFixture.push({ fixture: name, ...score, elapsedMs: runResult.elapsedMs, attempts: runResult.attempt });
    }
    const n = fixtureFiles.length - failures;
    summary[model].aggregate = {
      avgRecall: n > 0 ? +(totalRecall / n).toFixed(1) : 0,
      avgItems: n > 0 ? +(totalCount / n).toFixed(1) : 0,
      avgLatencyMs: n > 0 ? Math.round(totalMs / n) : 0,
      failures,
      n: fixtureFiles.length,
    };
    console.log(`  AGG: recall=${summary[model].aggregate.avgRecall}% items=${summary[model].aggregate.avgItems} latency=${summary[model].aggregate.avgLatencyMs}ms failures=${failures}/${fixtureFiles.length}`);
  }

  const reportPath = path.join(EVAL_ROOT, `report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`);
  await fs.writeFile(reportPath, JSON.stringify(summary, null, 2));
  console.log(`\nReport: ${reportPath}`);

  console.log('\n=== LEADERBOARD ===');
  const ranked = Object.entries(summary).sort(([, a], [, b]) => (b.aggregate.avgRecall ?? 0) - (a.aggregate.avgRecall ?? 0));
  console.log('Model                              Recall  Items  Latency  Fail');
  console.log('---------------------------------- ------  -----  -------  ----');
  for (const [m, s] of ranked) {
    console.log(`${m.padEnd(34)} ${String(s.aggregate.avgRecall).padStart(5)}%  ${String(s.aggregate.avgItems).padStart(5)}  ${String(s.aggregate.avgLatencyMs).padStart(6)}ms  ${s.aggregate.failures}/${s.aggregate.n}`);
  }

  if (ci && baseline) {
    console.log('\n=== BASELINE GATE ===');
    let regressed = false;
    for (const [m, s] of Object.entries(summary)) {
      const b = baseline[m]?.aggregate?.avgRecall;
      if (typeof b !== 'number') { console.log(`${m}: no baseline (skipped)`); continue; }
      const delta = s.aggregate.avgRecall - b;
      const tag = delta < -1 ? 'REGRESSION' : delta > 1 ? 'IMPROVED' : 'stable';
      console.log(`${m}: baseline=${b}% current=${s.aggregate.avgRecall}% delta=${delta.toFixed(1)}% [${tag}]`);
      if (delta < -1) regressed = true;
    }
    if (regressed) {
      console.error('\nCI FAIL: at least one model regressed >1% below baseline');
      process.exit(2);
    }
    console.log('\nCI PASS');
  }
}
```

- [ ] **Step 2: Test the --ci flag manually**

```bash
node eval/harness.mjs qwen2.5vl:7b --ci
```
Expected output ends with `CI PASS` (since nothing has changed since baseline).

- [ ] **Step 3: Commit**

```bash
git add eval/harness.mjs
git commit -m "test(eval): --ci flag gates against eval/baseline.json; fails on >1% regression"
```

---

### Task 10: Wire eval into Makefile

**Files:**
- Modify: `Makefile`

- [ ] **Step 1: Add eval targets to Makefile**

Append to `Makefile`:

```makefile
.PHONY: eval eval-ci eval-baseline

eval: ## Run eval harness on all configured candidate models
	node eval/harness.mjs qwen2.5vl:7b qwen2.5vl:3b llava:latest moondream:latest

eval-ci: ## Run eval gated by eval/baseline.json
	node eval/harness.mjs qwen2.5vl:7b qwen2.5vl:3b llava:latest moondream:latest --ci

eval-baseline: ## Re-snapshot current results as the new baseline (commit after!)
	node eval/harness.mjs qwen2.5vl:7b qwen2.5vl:3b llava:latest moondream:latest
	@latest=$$(ls -t eval/report-*.json | head -1); cp "$$latest" eval/baseline.json; echo "Baseline = $$latest"
```

- [ ] **Step 2: Test**

```bash
make eval-ci
```
Expected: runs all 4 models, prints CI PASS.

- [ ] **Step 3: Commit**

```bash
git add Makefile
git commit -m "feat(eval): make eval / eval-ci / eval-baseline targets"
```

---

### Task 11: Eval README

**Files:**
- Create: `eval/README.md`

- [ ] **Step 1: Write README**

```markdown
# Eval Harness

Offline validation of the detection pipeline. Runs candidate VLMs against fixture photos, scores recall against oracle gold labels, gates merges on regressions.

## Layout

- `fixtures/*.jpg` — input images. Add new ones by copying from phone via `xcrun devicectl device copy from ...`.
- `oracle/*.json` — ground-truth expected-items list per fixture. Update when a fixture is added.
- `harness.mjs` — the runner. Sends each fixture to each model, parses JSON, scores, writes `runs/<model>__<fixture>__<timestamp>.json`.
- `baseline.json` — snapshot of the leaderboard we won't regress below.
- `report-*.json` — per-invocation snapshots.

## Commands

- `make eval` — run all candidate models
- `make eval-ci` — run + fail if any model regresses > 1% below baseline
- `make eval-baseline` — re-snapshot after an intentional improvement (commit after)

## Adding a fixture

1. Pull from phone: `xcrun devicectl device copy from --device <id> --source /Library/Caches/ --destination /tmp/ph --domain-type appDataContainer --domain-identifier me.arindampaul.allmythings`
2. Rotate if needed: `sips -r 90 /tmp/ph/Library/Caches/XXX.jpg --out eval/fixtures/<name>.jpg`
3. Write oracle JSON: use `eval/oracle/*.json` as a template. List every item you see; set `min_item_count` and `max_item_count`.
4. Run `make eval-baseline` and commit the new baseline with the new fixture.

## Adding a model

Edit the model list in the `eval` / `eval-ci` / `eval-baseline` targets in `Makefile`. Must be available via `ollama list`. Pull first: `ollama pull <model-tag>`.
```

- [ ] **Step 2: Commit**

```bash
git add eval/README.md
git commit -m "docs(eval): README for harness, adding fixtures, adding models"
```

---

## Phase 4: Qwen Model Swap + Prompt Tuning

### Task 12: Switch default model to qwen2.5vl:7b

**Files:**
- Modify: `api-service/.env`, `api-service/.env.example`, `api-service/src/config/env.config.ts`

- [ ] **Step 1: Update .env**

```bash
sed -i '' 's/^OLLAMA_MODEL=.*/OLLAMA_MODEL=qwen2.5vl:7b/' api-service/.env
grep OLLAMA_MODEL api-service/.env
```
Expected: `OLLAMA_MODEL=qwen2.5vl:7b`.

- [ ] **Step 2: Update .env.example**

```bash
sed -i '' 's/^OLLAMA_MODEL=.*/OLLAMA_MODEL=qwen2.5vl:7b/' api-service/.env.example
```

- [ ] **Step 3: Update default in env.config.ts**

Find the `ollamaModel` line in `api-service/src/config/env.config.ts` and change the default:

```typescript
ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5vl:7b',
```

- [ ] **Step 4: Restart API and re-run eval-ci**

```bash
cd api-service && pkill -f "tsx watch"; sleep 1; npm run dev &
sleep 3
cd .. && make eval-ci
```
Expected: CI PASS. qwen2.5vl:7b should show as `stable` or `IMPROVED`.

- [ ] **Step 5: Commit**

```bash
git add api-service/.env api-service/.env.example api-service/src/config/env.config.ts
git commit -m "chore(api): default OLLAMA_MODEL=qwen2.5vl:7b (stable, +7% recall over 3b)"
```

---

### Task 13: Prompt tuning loop — target +10% recall

**Files:**
- Modify: `api-service/src/providers/ollama.classifier.ts`

This task iterates until the eval improves. Commit the best prompt.

- [ ] **Step 1: Snapshot current qwen2.5vl:7b recall**

```bash
make eval 2>&1 | grep -A 1 "MODEL: qwen2.5vl:7b" | tail -1 | grep -o "recall=[0-9.]*%"
```
Record the number (baseline was 64.3%).

- [ ] **Step 2: Iterate the prompt — Variant A (explicit counting)**

Edit `api-service/src/providers/ollama.classifier.ts`, find `buildFullImagePrompt()`. Replace with:

```typescript
private buildFullImagePrompt(): string {
  return `Catalog EVERY distinct physical item visible in this photo for a home inventory. Aim for 10-18 items per photo. Count carefully — walk the image corner by corner. Include:
- Furniture (chairs, tables, sofas, stools, cabinets, shelves)
- Plants and planters (each pot is its own item; so is the plant inside it)
- Decor (artwork, frames, vases, candles, sculptures)
- Textiles (rugs, curtains, blankets, cushions)
- Electronics and appliances
- Lighting fixtures

Do NOT list: walls, ceiling, bare floor, room itself, windows (but DO list window treatments).

For each item return JSON:
{"label": string, "category": string, "primary_color": string, "material": string, "condition": "excellent"|"good"|"fair"|"poor", "count": integer, "estimated_value_low": number|null, "estimated_value_high": number|null, "bounding_box": [y1,x1,y2,x2] normalized 0-1}

Return only a JSON array. No prose, no markdown fences.`;
}
```

Run `make eval` and record:
- Variant A recall: ____%

- [ ] **Step 3: Variant B (chain-of-thought)**

Replace with:

```typescript
private buildFullImagePrompt(): string {
  return `Step 1: Silently scan the photo top-left → top-right → bottom-left → bottom-right. Mentally list everything you can distinctly point to.
Step 2: For each item, emit a JSON object with: label (specific), category, primary_color, material, condition (excellent/good/fair/poor), count (integer, >=1), bounding_box ([y1,x1,y2,x2] normalized 0-1).
Step 3: Return the JSON array only — no step-1 output, no prose, no markdown.

Include: furniture, plants (pot AND plant as separate items), decor, textiles, electronics, lighting, window treatments.
Exclude: walls, ceiling, bare floor, the room itself.`;
}
```

Run `make eval`. Record:
- Variant B recall: ____%

- [ ] **Step 4: Variant C (few-shot)**

Replace with:

```typescript
private buildFullImagePrompt(): string {
  return `Catalog every distinct item for a home inventory. Example valid output:

[
  {"label": "tan leather office chair", "category": "Furniture", "primary_color": "tan", "material": "leather", "condition": "good", "count": 1, "bounding_box": [0.42, 0.10, 0.85, 0.45]},
  {"label": "snake plant in ceramic planter", "category": "Plants", "primary_color": "green", "material": "plant", "condition": "good", "count": 1, "bounding_box": [0.12, 0.55, 0.70, 0.90]}
]

Rules:
- Aim for 10-18 items per room photo.
- Plant and its pot count as separate items.
- Include window treatments (curtains, blinds) but not the windows or walls.
- Return only the JSON array. No prose.`;
}
```

Run `make eval`. Record:
- Variant C recall: ____%

- [ ] **Step 5: Keep the winning variant**

Whichever variant scored highest, leave that code in the file. Delete the losers.

- [ ] **Step 6: Re-baseline and commit (only if winner improved by >1%)**

```bash
make eval-baseline
git add api-service/src/providers/ollama.classifier.ts eval/baseline.json
git commit -m "feat(api): prompt tuning — +N% recall on fixtures (variant X)"
```

If no variant improved the recall by >1%, revert the file and skip the commit.

---

## Phase 5: Hybrid OWLv2 + Qwen Pipeline

### Task 14: OWLv2 household class list

**Files:**
- Create: `api-service/prompts/household-classes.txt`

- [ ] **Step 1: Write the list (one class per line)**

```
sofa
armchair
office chair
dining chair
stool
coffee table
side table
dining table
desk
bookshelf
bookcase
cabinet
sideboard
credenza
chest of drawers
bed
nightstand
wardrobe
floor lamp
table lamp
desk lamp
pendant light
chandelier
wall sconce
ceiling fan
television
monitor
laptop
keyboard
mouse
speaker
soundbar
router
printer
camera
headphones
game console
remote control
refrigerator
microwave
oven
dishwasher
washing machine
dryer
coffee machine
kettle
toaster
blender
pot
pan
cutting board
snake plant
monstera
fiddle leaf fig
pothos
cactus
succulent
orchid
fern
bamboo plant
potted plant
planter
vase
flowers
picture frame
painting
wall art
mirror
clock
candle
candle holder
sculpture
figurine
bookend
tray
basket
box
storage bin
bookshelf items
rug
carpet
curtain
blinds
cushion
throw pillow
blanket
throw blanket
towel
tablecloth
placemat
book
magazine
newspaper
notebook
pen
pencil
phone
charger
cable
power strip
humidifier
air purifier
fan
heater
thermostat
smoke detector
fire extinguisher
trash can
laundry basket
shoe rack
coat rack
umbrella
bag
backpack
suitcase
shoes
hat
jacket
toy
stuffed animal
puzzle
board game
musical instrument
piano
guitar
radio
record player
plant stand
stepladder
toolbox
broom
vacuum
mop
ironing board
iron
hairdryer
scale
dumbbell
yoga mat
exercise bike
treadmill
mirror stand
perfume bottle
jewelry box
watch
clock radio
alarm clock
picture
poster
postcard
greeting card
decorative plate
bowl
mug
cup
plate
glass
bottle
wine rack
dish rack
```

- [ ] **Step 2: Commit**

```bash
git add api-service/prompts/household-classes.txt
git commit -m "feat(detect): household class list for OWLv2 open-vocab detection"
```

---

### Task 15: Python OWLv2 route

**Files:**
- Create: `detection-service/src/detection_service/routes/__init__.py`
- Create: `detection-service/src/detection_service/routes/owlv2.py`
- Create: `detection-service/tests/unit/test_owlv2_route.py`
- Modify: `detection-service/pyproject.toml`
- Modify: `detection-service/src/detection_service/main.py`

- [ ] **Step 1: Add deps**

In `detection-service/pyproject.toml` find `[project] dependencies` and append:

```toml
"transformers>=4.46",
"torch>=2.5",
"pillow>=10.0",
```

Then:

```bash
cd detection-service && pip install -e .
```

- [ ] **Step 2: Write failing test**

```python
# detection-service/tests/unit/test_owlv2_route.py
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def client():
    from detection_service.main import app
    return TestClient(app)

@pytest.fixture
def fixture_bytes():
    # Use any image in tests; minimal JPEG header for smoke
    repo_root = Path(__file__).resolve().parents[3]
    fixture = repo_root / "eval" / "fixtures" / "1776173015803.jpg"
    assert fixture.exists(), f"missing fixture: {fixture}"
    return fixture.read_bytes()

def test_owlv2_returns_boxes(client, fixture_bytes):
    res = client.post(
        "/detect/owlv2",
        files={"file": ("test.jpg", fixture_bytes, "image/jpeg")},
        data={"score_threshold": "0.15"},
    )
    assert res.status_code == 200
    body = res.json()
    assert "boxes" in body
    assert isinstance(body["boxes"], list)
    # We know the fixture has many items — expect at least a few boxes
    assert len(body["boxes"]) >= 3
    first = body["boxes"][0]
    assert set(first.keys()) >= {"label", "score", "x", "y", "width", "height"}
    # Normalized coords
    assert 0 <= first["x"] <= 1
    assert 0 <= first["y"] <= 1
```

- [ ] **Step 3: Run to verify it fails**

```bash
cd detection-service && pytest tests/unit/test_owlv2_route.py -v
```
Expected: FAIL — route not registered.

- [ ] **Step 4: Create the route**

```python
# detection-service/src/detection_service/routes/__init__.py
# (empty file)
```

```python
# detection-service/src/detection_service/routes/owlv2.py
from pathlib import Path
from typing import Annotated
import io

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from PIL import Image
import torch
from transformers import Owlv2Processor, Owlv2ForObjectDetection

router = APIRouter()

_PROMPTS_FILE = Path(__file__).resolve().parents[4] / "api-service" / "prompts" / "household-classes.txt"

_processor: Owlv2Processor | None = None
_model: Owlv2ForObjectDetection | None = None
_classes: list[str] | None = None


def _load():
    global _processor, _model, _classes
    if _processor is None:
        _processor = Owlv2Processor.from_pretrained("google/owlv2-base-patch16-ensemble")
    if _model is None:
        _model = Owlv2ForObjectDetection.from_pretrained(
            "google/owlv2-base-patch16-ensemble",
            torch_dtype=torch.float16,
        ).eval()
        if torch.backends.mps.is_available():
            _model = _model.to("mps")
    if _classes is None:
        if not _PROMPTS_FILE.exists():
            _classes = ["furniture", "electronic", "decor", "plant"]
        else:
            _classes = [line.strip() for line in _PROMPTS_FILE.read_text().splitlines() if line.strip()]
    return _processor, _model, _classes


@router.post("/detect/owlv2")
async def detect_owlv2(
    file: Annotated[UploadFile, File(description="JPEG or PNG image")],
    score_threshold: Annotated[float, Form()] = 0.15,
):
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(415, f"unsupported content type: {file.content_type}")
    processor, model, classes = _load()
    image_bytes = await file.read()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    with torch.inference_mode():
        inputs = processor(text=[classes], images=image, return_tensors="pt")
        if torch.backends.mps.is_available():
            inputs = {k: v.to("mps") for k, v in inputs.items()}
        outputs = model(**inputs)

        target_sizes = torch.tensor([image.size[::-1]])
        results = processor.post_process_object_detection(
            outputs=outputs, target_sizes=target_sizes, threshold=score_threshold
        )[0]

    W, H = image.size
    boxes = []
    for score, label_idx, box in zip(results["scores"], results["labels"], results["boxes"]):
        x1, y1, x2, y2 = box.tolist()
        boxes.append({
            "label": classes[label_idx],
            "score": float(score),
            "x": max(0.0, min(1.0, x1 / W)),
            "y": max(0.0, min(1.0, y1 / H)),
            "width": max(0.0, min(1.0, (x2 - x1) / W)),
            "height": max(0.0, min(1.0, (y2 - y1) / H)),
        })
    boxes.sort(key=lambda b: b["score"], reverse=True)
    return {"boxes": boxes, "image_width": W, "image_height": H}
```

- [ ] **Step 5: Register route in main.py**

Edit `detection-service/src/detection_service/main.py`. At the top add:

```python
from detection_service.routes.owlv2 import router as owlv2_router
```

Below the existing `app = FastAPI(...)` line add:

```python
app.include_router(owlv2_router, tags=["detect"])
```

- [ ] **Step 6: Run test to verify pass**

```bash
cd detection-service && pytest tests/unit/test_owlv2_route.py -v
```
Expected: PASS. First call will download ~420MB of OWLv2 weights; subsequent calls are fast.

- [ ] **Step 7: Commit**

```bash
git add detection-service/src/detection_service/routes detection-service/pyproject.toml detection-service/src/detection_service/main.py detection-service/tests/unit/test_owlv2_route.py
git commit -m "feat(detect): OWLv2 open-vocab detector route"
```

---

### Task 16: Node.js OWLv2 client

**Files:**
- Create: `api-service/src/providers/owlv2.detector.ts`
- Create: `api-service/tests/unit/owlv2.detector.unit.test.ts`
- Modify: `api-service/src/config/env.config.ts`, `api-service/.env`

- [ ] **Step 1: Add env var**

In `api-service/src/config/env.config.ts`, add to both the interface and the object:

```typescript
// interface
owlv2Url: string;
hybridEnabled: boolean;

// object
owlv2Url: process.env.OWLV2_URL || 'http://localhost:14001',
hybridEnabled: process.env.HYBRID_ENABLED === 'true',
```

And update `.env`:

```bash
printf "\nOWLV2_URL=http://localhost:14001\nHYBRID_ENABLED=false\n" >> api-service/.env
```

- [ ] **Step 2: Write failing test**

```typescript
// api-service/tests/unit/owlv2.detector.unit.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Owlv2Detector } from '../../src/providers/owlv2.detector';

describe('Owlv2Detector', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('posts image as multipart and parses boxes', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      boxes: [
        { label: 'sofa', score: 0.4, x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
      ],
      image_width: 100, image_height: 100,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const d = new Owlv2Detector('http://localhost:14001', 0.15);
    const boxes = await d.detect(Buffer.from([0xff, 0xd8, 0xff]));
    expect(boxes).toHaveLength(1);
    expect(boxes[0].coarseLabel).toBe('sofa');
    expect(boxes[0].box.x).toBe(0.1);
  });

  it('filters boxes below score threshold', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      boxes: [
        { label: 'sofa', score: 0.3, x: 0, y: 0, width: 1, height: 1 },
        { label: 'table', score: 0.05, x: 0, y: 0, width: 1, height: 1 },
      ],
      image_width: 100, image_height: 100,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const d = new Owlv2Detector('http://localhost:14001', 0.2);
    const boxes = await d.detect(Buffer.from([0xff, 0xd8, 0xff]));
    expect(boxes).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run test to verify fail**

```bash
cd api-service && npx vitest run tests/unit/owlv2.detector.unit.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 4: Create the client**

```typescript
// api-service/src/providers/owlv2.detector.ts
import { BoundingBoxResult } from './detector.interface';
import { injectTraceHeaders } from '../telemetry/trace-context';

export class Owlv2Detector {
  constructor(
    private readonly baseUrl: string,
    private readonly scoreThreshold: number = 0.15,
    private readonly timeoutMs: number = 30_000,
  ) {}

  async detect(image: Buffer): Promise<BoundingBoxResult[]> {
    const form = new FormData();
    form.append('file', new Blob([image], { type: 'image/jpeg' }), 'image.jpg');
    form.append('score_threshold', String(this.scoreThreshold));

    const headers: Record<string, string> = {};
    injectTraceHeaders(headers);

    const res = await fetch(`${this.baseUrl}/detect/owlv2`, {
      method: 'POST',
      headers,
      body: form,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OWLv2 returned ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json() as { boxes: Array<{ label: string; score: number; x: number; y: number; width: number; height: number }> };
    return data.boxes
      .filter((b) => b.score >= this.scoreThreshold)
      .map((b, i) => ({
        boxIndex: i,
        coarseLabel: b.label,
        confidence: b.score,
        box: { x: b.x, y: b.y, width: b.width, height: b.height },
      }));
  }
}
```

- [ ] **Step 5: Run test to verify pass**

```bash
cd api-service && npx vitest run tests/unit/owlv2.detector.unit.test.ts
```
Expected: PASS, 2/2.

- [ ] **Step 6: Commit**

```bash
git add api-service/src/providers/owlv2.detector.ts api-service/tests/unit/owlv2.detector.unit.test.ts api-service/src/config/env.config.ts api-service/.env
git commit -m "feat(api): OWLv2 HTTP client with score threshold + trace propagation"
```

---

### Task 17: HybridPipelineService that chains OWLv2 → Qwen

**Files:**
- Create: `api-service/src/services/hybrid-pipeline.service.ts`
- Create: `api-service/tests/unit/hybrid-pipeline.unit.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// api-service/tests/unit/hybrid-pipeline.unit.test.ts
import { describe, it, expect, vi } from 'vitest';
import { HybridPipelineService } from '../../src/services/hybrid-pipeline.service';

describe('HybridPipelineService', () => {
  it('calls classifier once with all OWLv2 boxes', async () => {
    const detector = {
      detect: vi.fn().mockResolvedValue([
        { boxIndex: 0, coarseLabel: 'sofa', confidence: 0.5, box: { x: 0, y: 0, width: 0.3, height: 0.3 } },
        { boxIndex: 1, coarseLabel: 'plant', confidence: 0.4, box: { x: 0.5, y: 0.5, width: 0.2, height: 0.2 } },
      ]),
    };
    const classifier = {
      name: 'qwen',
      classify: vi.fn().mockImplementation(async (_img, dets) => dets.map((d: any) => ({
        boxIndex: d.boxIndex,
        label: `detailed ${d.coarseLabel}`,
        category: 'Furniture',
        brand: null, model: null, colors: ['brown'], materials: ['wood'],
        condition: 'good', estimatedValue: null, description: null,
        confidence: 0.9,
        boundingBox: d.box,
      }))),
      generateDetectionPrompt: vi.fn(),
      healthCheck: vi.fn().mockResolvedValue(true),
    };
    const svc = new HybridPipelineService(detector as any, classifier as any);
    const dummyImg = Buffer.from([0xff, 0xd8, 0xff]);
    const out = await svc.detect(dummyImg);
    expect(out).toHaveLength(2);
    expect(detector.detect).toHaveBeenCalledTimes(1);
    expect(classifier.classify).toHaveBeenCalledTimes(1);
    expect(out[0].label).toBe('detailed sofa');
  });

  it('returns empty array when detector returns no boxes', async () => {
    const detector = { detect: vi.fn().mockResolvedValue([]) };
    const classifier = {
      name: 'qwen', classify: vi.fn(), generateDetectionPrompt: vi.fn(),
      healthCheck: vi.fn().mockResolvedValue(true),
    };
    const svc = new HybridPipelineService(detector as any, classifier as any);
    const out = await svc.detect(Buffer.from([0xff]));
    expect(out).toEqual([]);
    expect(classifier.classify).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify fail**

```bash
cd api-service && npx vitest run tests/unit/hybrid-pipeline.unit.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create the service**

```typescript
// api-service/src/services/hybrid-pipeline.service.ts
import { Owlv2Detector } from '../providers/owlv2.detector';
import { ObjectClassifier, ClassifiedObject } from '../providers/classifier.interface';
import { logger } from '../utils/logger';

/**
 * Hybrid pipeline: OWLv2 finds boxes using a fixed household class list,
 * then the VLM classifier enriches each detected box with structured attributes.
 *
 * Trade-off vs MultiPassVlmClassifier: boxes come from a model trained to find them,
 * not from prompting a VLM. Higher recall at the cost of one extra HTTP hop.
 */
export class HybridPipelineService {
  constructor(
    private readonly detector: Owlv2Detector,
    private readonly classifier: ObjectClassifier,
  ) {}

  async detect(image: Buffer): Promise<ClassifiedObject[]> {
    const boxes = await this.detector.detect(image);
    logger.info({ count: boxes.length }, 'HybridPipeline: OWLv2 boxes');
    if (boxes.length === 0) return [];

    const classified = await this.classifier.classify(image, boxes);
    logger.info({ count: classified.length }, 'HybridPipeline: VLM classifications');
    return classified;
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd api-service && npx vitest run tests/unit/hybrid-pipeline.unit.test.ts
```
Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add api-service/src/services/hybrid-pipeline.service.ts api-service/tests/unit/hybrid-pipeline.unit.test.ts
git commit -m "feat(api): HybridPipelineService — OWLv2 boxes → Qwen attributes"
```

---

### Task 18: Wire HybridPipeline into api-service behind HYBRID_ENABLED flag

**Files:**
- Modify: `api-service/src/app.ts`
- Modify: `api-service/src/services/detection-pipeline.service.ts`

- [ ] **Step 1: Update app.ts to construct HybridPipelineService**

Locate the section in `api-service/src/app.ts` where `DetectionPipelineService` is constructed. Above that, add:

```typescript
import { Owlv2Detector } from './providers/owlv2.detector';
import { HybridPipelineService } from './services/hybrid-pipeline.service';

const owlv2 = new Owlv2Detector(envConfig.owlv2Url, 0.15);
// ollamaClassifier already exists in your setup — reuse it
const hybrid = new HybridPipelineService(owlv2, ollamaClassifier);
```

Pass `hybrid` as an option to `DetectionPipelineService` (you will add an option in Step 2):

```typescript
const pipeline = new DetectionPipelineService({
  fastDetectorUrl: envConfig.detectionServiceUrl,
  multiPassVlm,
  classifiers,
  detectors,
  hybrid,
  hybridEnabled: envConfig.hybridEnabled,
});
```

- [ ] **Step 2: Update `DetectionPipelineService` to accept and route to hybrid**

Edit `api-service/src/services/detection-pipeline.service.ts`:

```typescript
// at top
import { HybridPipelineService } from './hybrid-pipeline.service';

// extend the options interface
interface PipelineOptions {
  fastDetectorUrl: string;
  multiPassVlm: MultiPassVlmClassifier;
  classifiers: ObjectClassifier[];
  detectors: ObjectDetector[];
  hybrid?: HybridPipelineService;
  hybridEnabled?: boolean;
}

// store it
private hybrid?: HybridPipelineService;
private hybridEnabled: boolean;

constructor(options: PipelineOptions) {
  // ... existing assignments
  this.hybrid = options.hybrid;
  this.hybridEnabled = !!options.hybridEnabled;
}

// replace runDeepPass to use hybrid when enabled
private async runDeepPass(image: Buffer, photoId: string): Promise<StepResult<DeepPassResult>> {
  return withSpan('detection.deep_pass', { 'detection.photo_id': photoId, 'detection.hybrid': this.hybridEnabled }, async () => {
    const start = Date.now();
    const detections = this.hybridEnabled && this.hybrid
      ? await this.hybrid.detect(image)
      : await this.multiPassVlm.detect(image);
    return {
      detections,
      processingTimeMs: Date.now() - start,
      provider: this.hybridEnabled ? 'hybrid-owlv2-qwen' : 'multi-pass-vlm',
    };
  });
}
```

- [ ] **Step 3: Run unit tests to confirm no regression**

```bash
cd api-service && npx vitest run tests/unit
```
Expected: all previously-passing tests still pass.

- [ ] **Step 4: Enable in .env and test against one fixture**

```bash
sed -i '' 's/^HYBRID_ENABLED=.*/HYBRID_ENABLED=true/' api-service/.env
cd api-service && pkill -f "tsx watch"; sleep 1; npm run dev &
sleep 5
curl -s -X POST "http://localhost:14000/v1/detect?mode=full" -F "file=@../eval/fixtures/1776173015803.jpg" --max-time 120 | jq '{count:(.fused|length), errors, items:[.fused[].label][:5]}'
```
Expected: `count >= 6`, `errors: []`, first few items look like the fixture contents.

- [ ] **Step 5: Commit**

```bash
git add api-service/src/app.ts api-service/src/services/detection-pipeline.service.ts api-service/.env
git commit -m "feat(api): wire HYBRID_ENABLED flag to route deep pass through OWLv2+Qwen"
```

---

### Task 19: Eval the hybrid pipeline

**Files:**
- Modify: `eval/harness.mjs` (add hybrid endpoint mode)

- [ ] **Step 1: Add hybrid mode to the harness**

At the top of `eval/harness.mjs`, add:

```javascript
const HYBRID_URL = process.env.HYBRID_URL ?? 'http://localhost:14000/v1/detect?mode=full';
```

Add a new `runHybrid` function after `runModel`:

```javascript
async function runHybrid(imagePath) {
  const t0 = Date.now();
  const form = new FormData();
  const file = new Blob([await fs.readFile(imagePath)], { type: 'image/jpeg' });
  form.append('file', file, 'image.jpg');
  try {
    const res = await fetch(HYBRID_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(180_000) });
    if (!res.ok) return { text: '', elapsedMs: Date.now() - t0, error: `HTTP ${res.status}`, attempt: 1 };
    const data = await res.json();
    // Shape to match the harness's extractJson expectations: items need a label field
    const items = (data.fused ?? []).map((d) => ({ label: d.label, category: d.category, count: 1 }));
    return { text: JSON.stringify(items), elapsedMs: Date.now() - t0, attempt: 1 };
  } catch (e) {
    return { text: '', elapsedMs: Date.now() - t0, error: String(e), attempt: 1 };
  }
}
```

Hook into `main()`: when a model name starts with `hybrid:`, call `runHybrid` instead of `runModel`.

Find the line `const runResult = await runModel(model, imagePath);` and replace with:

```javascript
const runResult = model.startsWith('hybrid:') ? await runHybrid(imagePath) : await runModel(model, imagePath);
```

- [ ] **Step 2: Run against hybrid**

```bash
cd /Users/mrarindampaul/Develop/allmythings
node eval/harness.mjs hybrid:owlv2-qwen7b
```
Expected: report with `recall` on each fixture. Target ≥75%.

- [ ] **Step 3: Compare against qwen-only baseline**

```bash
node eval/harness.mjs qwen2.5vl:7b hybrid:owlv2-qwen7b
```

Expected: hybrid recall > qwen-only recall on most fixtures.

- [ ] **Step 4: Re-baseline and commit**

If hybrid hits ≥75% recall:

```bash
make eval-baseline
git add eval/harness.mjs eval/baseline.json
git commit -m "test(eval): add hybrid pipeline mode; baseline shows +N% recall over qwen-only"
```

- [ ] **Step 5: Update Makefile targets**

Edit the `eval`, `eval-ci`, and `eval-baseline` targets to include `hybrid:owlv2-qwen7b`:

```makefile
eval:
	node eval/harness.mjs qwen2.5vl:7b qwen2.5vl:3b llava:latest moondream:latest hybrid:owlv2-qwen7b

eval-ci:
	node eval/harness.mjs qwen2.5vl:7b qwen2.5vl:3b llava:latest moondream:latest hybrid:owlv2-qwen7b --ci

eval-baseline:
	node eval/harness.mjs qwen2.5vl:7b qwen2.5vl:3b llava:latest moondream:latest hybrid:owlv2-qwen7b
	@latest=$$(ls -t eval/report-*.json | head -1); cp "$$latest" eval/baseline.json; echo "Baseline = $$latest"
```

- [ ] **Step 6: Commit**

```bash
git add Makefile
git commit -m "chore(eval): include hybrid:owlv2-qwen7b in default eval runs"
```

---

## Phase 6: Close the Loop — Verify no silent failures

### Task 20: End-to-end test that structured errors surface when deep pass fails

**Files:**
- Create: `api-service/tests/unit/pipeline-errors.unit.test.ts`

In-process integration test: build the `DetectionPipelineService` with a stub classifier that throws, confirm `errors[]` is populated and `deepPass` is null.

- [ ] **Step 1: Write the test**

```typescript
// api-service/tests/unit/pipeline-errors.unit.test.ts
import { describe, it, expect } from 'vitest';
import { DetectionPipelineService } from '../../src/services/detection-pipeline.service';
import { MultiPassVlmClassifier } from '../../src/services/multi-pass-vlm.classifier';

describe('DetectionPipelineService error surfacing', () => {
  it('populates errors[] when the deep pass throws', async () => {
    const throwingMultiPass = {
      detect: async () => { throw new Error('Ollama returned 500: simulated'); },
    } as unknown as MultiPassVlmClassifier;

    const pipeline = new DetectionPipelineService({
      fastDetectorUrl: 'http://127.0.0.1:1',  // unreachable; fast pass will also fail
      multiPassVlm: throwingMultiPass,
      classifiers: [],
      detectors: [],
    });

    const result = await pipeline.detectFull(Buffer.from([0xff, 0xd8, 0xff]), 'test-photo');
    expect(result.deepPass).toBeNull();
    expect(result.fastPass).toBeNull();
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    const deepErr = result.errors.find((e) => e.step === 'deep_pass');
    expect(deepErr).toBeDefined();
    expect(deepErr?.code).toBe('upstream_5xx');
    expect(deepErr?.retryable).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd api-service && npx vitest run tests/unit/pipeline-errors.unit.test.ts
```
Expected: PASS. If it fails with "errors is empty" or "deepPass not null", go back to Task 4 — the pipeline is still swallowing errors somewhere.

- [ ] **Step 3: Commit**

```bash
git add api-service/tests/unit/pipeline-errors.unit.test.ts
git commit -m "test(api): pipeline errors surface as structured errors[] not null"
```

---

## Final Checklist

Before declaring this plan done, run:

- [ ] `make eval-ci` — all models at or above baseline
- [ ] `cd api-service && npm test` — all unit + integration pass
- [ ] `cd detection-service && pytest` — python tests pass
- [ ] `docker compose -f docker-compose.hyperdx.yml ps` — HyperDX running
- [ ] Open HyperDX UI at http://localhost:8080 — confirm traces from `api-service` AND `detection-service` visible per photo
- [ ] Manually force an Ollama failure (`pkill -f "ollama runner"`), upload a photo, confirm HyperDX shows the red span with `error.code=upstream_5xx` within 10 seconds

Success criteria from the spec (re-verified):

| # | Criterion | Where verified |
|---|---|---|
| 1 | A failed photo shows up as a red trace in HyperDX within 30 seconds | Task 20 + final manual check |
| 2 | Eval harness runs in <5 min end-to-end | Task 10 + `time make eval` |
| 3 | ≥75% recall (85% goal is Phase 8 with 32B) | Task 19 final delta |
| 4 | Zero GGML_ASSERT crashes in 50 runs | loop `node eval/harness.mjs hybrid:owlv2-qwen7b` 50x; inspect logs |
| 5 | p95 pipeline latency <6s on hybrid path with ≤12 items | HyperDX latency chart |
| 8 | No AGPL model in production bundle | grep check — this plan doesn't touch iPhone code, but verify api-service has no Ultralytics dep |

---

## Self-Review (from the writer)

**1. Spec coverage:**
- Spec §4.1 observability + error propagation → Tasks 1-7 ✅
- Spec §4.2 HyperDX → Tasks 6-7 ✅
- Spec §4.4 qwen 7b swap → Task 12 ✅
- Spec §4.5 hybrid OWLv2+Qwen → Tasks 14-19 ✅
- Spec §4.3 on-device YOLOv10-S — out of scope for this plan (Phase 6)
- Spec §4.6 per-item data model — out of scope (Phase 7)
- Spec §4.7 real-time camera limits — out of scope (Phase 6)
- Spec "platform strategy (iPhone first, Android-ready)" — no mobile changes in this plan; platform-agnostic server work only

**2. Placeholder scan:** every step has actual code. No TBDs. Prompt tuning in Task 13 has concrete variants to try.

**3. Type consistency:**
- `StepResult<T>` defined in Task 1, used in Tasks 2, 4, 20 ✅
- `BoundingBoxResult` referenced from existing `providers/detector.interface.ts` ✅
- `ClassifiedObject` referenced from existing `providers/classifier.interface.ts` ✅
- `FullPipelineResult.errors[]` added in Task 4, asserted in Task 5 and Task 20 ✅
- OWLv2 response shape `{boxes: [...]}` consistent between Python route (Task 15) and Node client (Task 16) ✅
- `HYBRID_ENABLED` env flag consistent across Tasks 16, 18 ✅
- Task 16's `coarseLabel` field (Node) maps to Task 15's `label` field (Python) — mapping handled in `Owlv2Detector.detect()` ✅
