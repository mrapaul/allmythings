I now have everything I need to write Section 10. Let me generate the content.

# section-10-cleanup-cutover

## Purpose

This is the **final phase of the rewrite** (Phase 5 of [claude-plan.md](../claude-plan.md)). With all of the new pipeline-service ops in place (sections 01–07), the eval rig green twice in a row from a real corpus (section 09), and the mobile app fully migrated to the new `SceneObservation` shape (section 08), this section is the irreversible **delete-the-old-thing** pass:

- Remove the dual-code-path feature flag.
- Delete the entire Temporal stack from `api-service/`.
- Delete the dead legacy provider/schema/quality services.
- Delete the temporary translation shim.
- Drop legacy env-vars (`TEMPORAL_*`, `TIER_*`).
- **Keep** `circuit-breaker.ts` — it now wraps `pipeline.client.ts`.
- Update `CLAUDE.md` so the project documentation matches reality.
- Lock the deletions with phase-gate lints that fail CI if anything regresses.

After this section the only path from the phone to detection results is `mobile-app → Fastify → pipeline.client → pipeline-service (Dagster in-process) → result`. There is no other live code path.

## Dependencies (must be satisfied before starting)

This section MUST NOT begin until **all** of the following are true:

1. **section-07-agreement-and-diagnosis** is merged — the new pipeline produces final `SceneObservation` with `agreement_score`, `confidence`, `flagged/flag_reason`.
2. **section-08-mobile-rewrite** is merged AND the only mobile build in use targets the new `SceneObservation` shape (Drift v5, 3-frame burst, no CoreML branch). This is the gate that lets us delete `services/translation/`.
3. **section-09-eval-rig** has run on the real local corpus and reported **two consecutive green `make eval` runs** against `pipeline-service/eval/thresholds.json`. The second-most-recent and most-recent entries in `pipeline-service/eval/changelog.md` must both be all-green.

If any of those is not satisfied, **stop**. Section 10 is the brake on irreversibility; the two-green-eval gate exists precisely so we never delete a working code path on the strength of one lucky run.

## Test command

```
make verify
```

`make verify` runs:
- `cd api-service && npm run lint && npm test`
- `cd pipeline-service && uv run pytest`
- `npx tsx api-service/scripts/check-phase-gates.ts`
- `cd pipeline-service && uv run python scripts/check-phase-gates.py`

Section is "done" when all four pass on a clean checkout with the deletions applied.

---

## Background context (self-contained — no need to re-read the master plan)

### The state of the repo entering this section

Directory shape (relevant parts only):

```
api-service/
├── src/
│   ├── routes/
│   │   ├── detect.route.ts            # uses pipeline.client behind USE_PIPELINE_SERVICE flag
│   │   ├── detect-status.route.ts     # uses pipeline.client behind USE_PIPELINE_SERVICE flag
│   │   ├── photos.route.ts
│   │   ├── health.route.ts
│   │   └── metrics.route.ts
│   ├── clients/
│   │   └── pipeline.client.ts         # NEW (section 02), wraps loopback HTTP to pipeline-service
│   ├── services/
│   │   ├── provider-health.service.ts
│   │   ├── image-quality.service.ts   # ★ TO DELETE — image quality moved to mobile in section 08
│   │   ├── translation/               # ★ TO DELETE — temp legacy-shape adapter from Phase 6
│   │   └── (vision-orchestrator.service.ts / ensemble-fusion.service.ts may already be gone)
│   ├── temporal/                      # ★ TO DELETE — entire dir
│   ├── providers/                     # ★ TO DELETE — entire dir
│   ├── schemas/
│   │   └── detection.schema.ts        # ★ TO DELETE — legacy zod shape, dead code
│   ├── types/
│   │   └── pipeline.ts                # KEEP — shared TS mirror of Pydantic types
│   ├── utils/
│   │   ├── bonjour-advertiser.ts      # KEEP
│   │   └── circuit-breaker.ts         # ★★ KEEP — wired around pipeline.client
│   ├── telemetry/                     # KEEP
│   └── config/
│       └── env.config.ts              # ★ EDIT — drop TEMPORAL_* + TIER_*; keep PIPELINE_URL, DAGSTER_HOME
├── tests/
│   ├── unit/
│   │   ├── routes/
│   │   ├── clients/pipeline.client.test.ts
│   │   └── temporal/                  # ★ TO DELETE — entire dir
│   └── integration/
└── scripts/
    └── check-phase-gates.ts           # ★ EDIT/CONFIRM — phase-5 lints

pipeline-service/
├── eval/
│   ├── changelog.md                   # ★ READ — last two entries must be green
│   ├── thresholds.json
│   ├── corpora/                       # ★ MUST EXIST AND BE NON-EMPTY (gitignored)
│   └── ...
└── scripts/
    └── check-phase-gates.py           # ★ EDIT/CONFIRM — corpus + green-runs assertion

CLAUDE.md (project root)               # ★ EDIT — section "Architecture Overview" no longer
                                       #         describes Temporal / vision-orchestrator
```

### What is irreversible after this section

After this PR merges:
- All `temporal/` worker code is gone. There is no fallback to the previous orchestration.
- The `USE_PIPELINE_SERVICE` env-var has no effect (it's removed from the codebase entirely).
- The legacy mobile shape (`EnrichedItem`, `DetectResult`) cannot be served by the API even if a stale phone build calls in — Fastify will return 4xx.
- Anyone bringing back Temporal must do a code revert PR; the lints in `check-phase-gates.ts` and `check-phase-gates.py` will fail CI on a partial revert.

That's the intent. The two-green-eval gate is the brake.

---

## Tests FIRST

Per the project TDD rule, write these tests before performing any deletions. They start failing the moment the gate conditions are met (because the deletions haven't happened yet) and pass when the section is done.

### `api-service/scripts/check-phase-gates.ts` (CI lint script — Vitest harness)

The script is a CLI that exits non-zero if any phase-gate invariant is violated. It is invoked from `make verify` and from CI.

Test file: `api-service/tests/unit/scripts/check-phase-gates.test.ts`.

```ts
// Test: passes when post-cutover state is clean — temporal/ absent, providers/ absent,
//       detection.schema.ts absent, image-quality.service.ts absent,
//       services/translation/ absent, USE_PIPELINE_SERVICE not referenced anywhere
//       in src/, circuit-breaker.ts present.

// Test: FAILS when api-service/src/temporal/ exists.
//       Reason: section-10 must delete it.

// Test: FAILS when api-service/src/providers/ exists.

// Test: FAILS when api-service/src/schemas/detection.schema.ts exists.

// Test: FAILS when api-service/src/services/image-quality.service.ts exists.
//       (image quality is mobile-only post-section-08)

// Test: FAILS when api-service/src/services/translation/ exists.
//       (translation shim was a Phase 6→Phase 5 transition aid only)

// Test: FAILS when any *.ts file under api-service/src/ contains the literal
//       string "USE_PIPELINE_SERVICE" — the flag must be removed everywhere,
//       not just defaulted on. Match must use a tokenising read, not just
//       grep, to avoid hitting comments-about-the-removed-flag in CLAUDE.md
//       (CLAUDE.md is not under api-service/src/).

// Test: FAILS when api-service/src/utils/circuit-breaker.ts is MISSING.
//       (regression test for "delete circuit-breaker too" mistake;
//       circuit-breaker is KEPT and wired around pipeline.client)

// Test: FAILS when env.config.ts still references TEMPORAL_HOST, TEMPORAL_PORT,
//       TEMPORAL_NAMESPACE, TEMPORAL_TASK_QUEUE, TIER_PRIMARY_MODEL,
//       TIER_FALLBACK_MODEL, or any other TEMPORAL_*/TIER_* identifier.

// Test: PASSES when env.config.ts references PIPELINE_URL and DAGSTER_HOME
//       (sanity — the new vars must be present).

// Test: FAILS when api-service/tests/unit/temporal/ exists.

// Test: FAILS when package.json still has dependencies on @temporalio/client,
//       @temporalio/worker, @temporalio/workflow, or any "@temporalio/*" package.
```

The script exposes a `runChecks(rootDir): { failures: Failure[] }` function so the test harness can drive it with fixture directories (use `tmp` dirs) without polluting the real repo.

### `pipeline-service/scripts/check-phase-gates.py`

Test file: `pipeline-service/tests/unit/scripts/test_check_phase_gates.py`.

```python
# Test: PASSES when:
#       - pipeline-service/eval/corpora/ exists and contains at least one scene dir
#         (3-frame burst structure verified loosely — at least 3 image files in dir).
#       - pipeline-service/eval/changelog.md exists and the last two entries
#         (parsed from the file's YAML/JSON-fenced run blocks) both have
#         status == "green".

# Test: FAILS when corpora/ is missing entirely.

# Test: FAILS when corpora/ exists but is empty.

# Test: FAILS when changelog.md does not exist.

# Test: FAILS when only ONE green run is recorded (need TWO consecutive).

# Test: FAILS when the most recent run is green but the one before it is not
#       (must be CONSECUTIVE; resets on any failure).

# Test: FAILS when the most-recent run is RED, regardless of history.

# Test: corpora-checker is robust to extra files in corpus dir (e.g. .DS_Store).
```

Same shape: expose `run_checks(repo_root: Path) -> CheckResult` so tests pass in fixture dirs.

### `scripts/smoke-assertions.ts` — done-criteria assertions

The smoke harness is updated (kept under root `scripts/`) to assert the post-cutover system is healthy end-to-end. These tests run against a live `make start` stack.

```ts
// Test: `make start` brings up services in order:
//       LGTM stack → Florence detection-service → Ollama →
//       pipeline-service sidecar (warm-up blocking) → Fastify →
//       Dagster webserver UI. The startup script SHOULD fail loudly if any
//       earlier dependency is unhealthy.

// Test: pipeline-service GET /health → { ready: true } AFTER warm-up.

// Test: api-service GET /v1/health includes status fields for:
//       pipeline-service, Florence, Ollama. (provider-health.service.ts
//       was rewired in earlier sections; confirm here.)

// Test: POST /v1/detect with a synthetic 3-frame burst fixture
//       (committed under pipeline-service/eval/corpora/_smoke/) returns
//       200 with a SceneObservation within 60s — NOT EnrichedItem,
//       NOT DetectResult.

// Test: response shape passes a runtime zod parse against the SceneObservation
//       type from api-service/src/types/pipeline.ts.

// Test: Dagster webserver responds at localhost:3001 and the smoke run is
//       visible in its runs list (HTTP GET, parse response).

// Test: temp-dir cleanup — no orphan photo files in ~/allmythings-data/photos/
//       outside those whose sha256 appears in DAGSTER_HOME run records.

// Test: `node -e "require('./api-service/dist/index.js')"` does NOT load any
//       file from temporal/, providers/, schemas/detection.schema.ts,
//       services/image-quality.service.ts, or services/translation/.
//       (sanity: deletions actually took effect in the build artefact.)
```

Use stub bodies / docstrings; do not write live HTTP test mechanics here — the section-09 smoke infrastructure already defines fetch helpers.

### CLAUDE.md docs assertion

Test file: `api-service/tests/unit/scripts/check-claude-md.test.ts` (lightweight; can also be folded into `check-phase-gates.ts`).

```ts
// Test: top-level CLAUDE.md does NOT mention "Temporal", "vision-orchestrator",
//       "ensemble-fusion", "VisionOrchestratorService", "EnsembleFusionService",
//       or "USE_PIPELINE_SERVICE" in any code or prose paragraph.
//       (regression test: the doc is the source of truth for new contributors;
//       drift here is silent rot.)

// Test: top-level CLAUDE.md DOES mention "pipeline-service", "Dagster",
//       "SceneObservation", "agreement_scoring", "circuit-breaker.ts" (kept),
//       and the new architecture diagram fields.

// Test: any markdown link in CLAUDE.md points to a file that exists.
```

---

## Implementation steps

Carry these out in order. Do not parallelise — each step's lints depend on the prior step's deletions.

### Step 1 — Confirm gates are met

Before touching any code:

1. Run `cd pipeline-service && uv run python scripts/check-phase-gates.py`. It MUST pass (corpus exists, last two changelog entries green).
2. Confirm the running mobile build is on Drift v5 / new `SceneObservation` shape (section-08 acceptance).
3. Run `make verify` against the current `main` to capture a "before" baseline.

If step 1 fails, stop. The corpus and the two-green-run history are the only things keeping us from deleting working code prematurely.

### Step 2 — Flip the flag's default and remove all references

Edit `api-service/src/config/env.config.ts`:

- Remove `USE_PIPELINE_SERVICE` from the schema entirely.
- Add (or confirm existing) `PIPELINE_URL` (default `http://127.0.0.1:14100`) and `DAGSTER_HOME` (default `~/allmythings-data/dagster`).
- Remove ALL `TEMPORAL_*` keys: `TEMPORAL_HOST`, `TEMPORAL_PORT`, `TEMPORAL_NAMESPACE`, `TEMPORAL_TASK_QUEUE`, anything else with that prefix.
- Remove ALL `TIER_*` keys: `TIER_PRIMARY_MODEL`, `TIER_FALLBACK_MODEL`, etc. (Tier-chain logic now lives in pipeline-service `classification_refine`; the env knobs there are scoped to pipeline-service config, not Fastify.)

Edit `api-service/src/routes/detect.route.ts` and `api-service/src/routes/detect-status.route.ts`:

- Remove every conditional that branches on `USE_PIPELINE_SERVICE`. The `else` branch (Temporal) is dead code — delete it.
- The route now unconditionally uses `pipeline.client`.

Grep the entire `api-service/src/` tree for `USE_PIPELINE_SERVICE`. There should be zero matches when this step is done.

### Step 3 — Delete `api-service/src/temporal/` (and its tests)

`rm -rf` the following directories:

- `api-service/src/temporal/`
- `api-service/tests/unit/temporal/`

In `api-service/package.json`, remove every `@temporalio/*` dependency (typical set: `@temporalio/client`, `@temporalio/worker`, `@temporalio/workflow`, `@temporalio/activity`, `@temporalio/common`). Run `npm install` to update the lockfile.

In `api-service/src/index.ts` (the Fastify bootstrap entrypoint), remove any worker-startup or temporal-client-init code that still references the deleted module paths.

### Step 4 — Delete `api-service/src/providers/`

`rm -rf api-service/src/providers/`. Anything that imported from there (other than the temporal worker, already deleted) was already migrated to use `pipeline.client` in section 02; the remaining imports should be zero.

### Step 5 — Delete `api-service/src/schemas/detection.schema.ts`

This is the legacy Zod shape for `DetectResult` / `EnrichedItem`. After section 08 the only on-the-wire shape is `SceneObservation` (defined in `api-service/src/types/pipeline.ts`).

`rm api-service/src/schemas/detection.schema.ts`.

If the directory `api-service/src/schemas/` becomes empty, leave it (other schemas may live there in future). If it still has only stale legacy schemas referenced nowhere, delete those too — but only if a grep confirms zero importers.

### Step 6 — Delete `api-service/src/services/image-quality.service.ts`

Image-quality assessment moved to the mobile in section 08 (`mobile-app/lib/services/image_quality.dart`). The Fastify service is dead.

`rm api-service/src/services/image-quality.service.ts`. Verify no importers remain (grep). If the upload route was still calling it for any defensive purpose, remove that call — frames now arrive pre-gated by the mobile, and the pipeline does its own decoding/validation in `frame_intake`.

### Step 7 — Delete `api-service/src/services/translation/`

This module was added during section 02 / Phase 6 as a temporary Fastify-side adapter to convert legacy mobile-shape responses into `SceneObservation`-compatible shapes (and vice versa) so old phone builds could keep working while the new mobile rolled out. Section 08 acceptance means there are no old phone builds calling Fastify any more.

`rm -rf api-service/src/services/translation/`. Remove every importer.

If `detect.route.ts` was still wrapping its response in a `translateToLegacyShape()` call as a defensive default, remove that wrapping. The route now returns raw `SceneObservation`.

### Step 8 — Confirm `circuit-breaker.ts` is KEPT and wired

`api-service/src/utils/circuit-breaker.ts` MUST still exist and MUST wrap `pipeline.client.ts` calls. If a previous cleanup pass deleted it by accident, restore it from git history before continuing.

This is asserted explicitly by `check-phase-gates.ts` because deleting it is a common cleanup mistake (it looks Temporal-shaped).

### Step 9 — Update `provider-health.service.ts` if needed

By this point `provider-health.service.ts` should already be rewired (section 03 / 04) to ping pipeline-service `/health`, Florence, Ollama. Confirm: there should be NO ping to a Temporal frontend, no ping to a `vision-orchestrator`. If any such ping remains, remove it. The service drives `/v1/health`'s response.

### Step 10 — Update `CLAUDE.md` (project root)

Open `/Users/mrarindampaul/Develop/allmythings/CLAUDE.md` and rewrite the relevant sections:

- **Project Overview / Architecture Overview:** the architecture diagram should mirror §1 of [claude-plan.md](../claude-plan.md): mobile → Fastify → pipeline-service (Dagster in-process FastAPI sidecar) → Florence + Ollama, with the LGTM stack sidecar.
- Remove every reference to: `VisionOrchestratorService`, `EnsembleFusionService`, "ensemble fusion", "Temporal", "Temporal worker", "USE_PIPELINE_SERVICE", "tier chain" as an api-service concept (the tier chain is internal to pipeline-service `classification_refine`).
- Add references to: `pipeline-service/`, `pipeline.client.ts`, Dagster ops by name (`frame_intake`, `scene_embedding`, `vlm_prompt_expansion`, `florence_detect`, `grounding_dino_detect`, `sahi_recovery`, `effsam_segment`, `box_fusion`, `crop_embedding`, `cross_pass_dedup`, `cross_frame_dedup`, `classification_refine`, `agreement_scoring`, `self_diagnosis`, `assemble_result`), `SceneObservation`, `agreement_score`, `agreement_coverage`, `agreement_precision`, `circuit-breaker.ts` (kept).
- Update "Common Development Commands" to include `make eval`, `make verify`, the new `start-pipeline.sh` ordering, and the Dagster webserver UI URL (`http://localhost:3001`).
- Update "Adding a New Vision Provider" — the new path is to add a Dagster op under `pipeline-service/pipeline_service/ops/`, not a TypeScript adapter under `api-service/src/adapters/`.

The `check-claude-md.test.ts` lints will catch missed references.

### Step 11 — Wire `check-phase-gates.ts` into CI

Confirm `api-service/scripts/check-phase-gates.ts` is invoked from `make verify` (root `Makefile`) and from `.github/workflows/*` (or whichever CI runner is in use). If CI is local-only via `make verify`, that's sufficient — the section-09 eval and section-10 phase-gate scripts are the only two things blocking a regression.

Confirm `pipeline-service/scripts/check-phase-gates.py` is also invoked from `make verify`.

### Step 12 — Run the full verification

```
make verify
```

All four sub-runs (api lint+test, pipeline-service pytest, api phase-gates, pipeline-service phase-gates) must pass. If any fail, **do not** loosen the lint to make CI green — fix the underlying state.

Run the smoke once more:

```
./scripts/smoke.sh
```

This walks through the done-criteria assertions in `scripts/smoke-assertions.ts`.

---

## Done checklist

- [ ] Phase-gate preconditions verified: corpus exists, two consecutive green eval runs in changelog.
- [ ] `USE_PIPELINE_SERVICE` flag and every reference to it removed from `api-service/src/`.
- [ ] `api-service/src/temporal/` deleted; `api-service/tests/unit/temporal/` deleted.
- [ ] `api-service/src/providers/` deleted.
- [ ] `api-service/src/schemas/detection.schema.ts` deleted.
- [ ] `api-service/src/services/image-quality.service.ts` deleted.
- [ ] `api-service/src/services/translation/` deleted.
- [ ] `api-service/src/utils/circuit-breaker.ts` is **present** and wired around `pipeline.client.ts`.
- [ ] `env.config.ts` no longer mentions `TEMPORAL_*` or `TIER_*`; mentions `PIPELINE_URL` and `DAGSTER_HOME`.
- [ ] `package.json` has zero `@temporalio/*` dependencies; lockfile updated.
- [ ] `provider-health.service.ts` pings only pipeline-service / Florence / Ollama.
- [ ] `api-service/scripts/check-phase-gates.ts` exists and is invoked by `make verify`.
- [ ] `pipeline-service/scripts/check-phase-gates.py` exists and is invoked by `make verify`.
- [ ] `scripts/smoke-assertions.ts` updated with done-criteria; `./scripts/smoke.sh` passes.
- [ ] `CLAUDE.md` updated: no Temporal / vision-orchestrator / ensemble-fusion / `USE_PIPELINE_SERVICE`; mentions pipeline-service, Dagster ops, `SceneObservation`, `circuit-breaker.ts`.
- [ ] `make verify` is green on a clean checkout.

When all boxes are checked, the rewrite is complete.

---

## Notes on what NOT to do in this section

- Do **not** touch pipeline-service code. Bug fixes there are out of scope; raise them as separate PRs against earlier sections.
- Do **not** delete `api-service/src/utils/circuit-breaker.ts`. It looks legacy but it is **kept** and it is what gives Fastify a fast-fail path when the sidecar is unhealthy.
- Do **not** delete `api-service/src/types/pipeline.ts`. It is the TS mirror of the Pydantic types and is used by `pipeline.client.ts` and `detect.route.ts`.
- Do **not** delete `api-service/src/utils/bonjour-advertiser.ts` — the mobile still discovers Fastify via Bonjour mDNS.
- Do **not** widen the phase-gate lints to "warn" instead of "fail". The whole point is that they're hard gates.
- Do **not** rewrite `provider-health.service.ts` from scratch — only confirm it no longer pings dead targets. It was already rewired upstream.
- Do **not** add any new functionality. This section is delete-only + docs + lints.