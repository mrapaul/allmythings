<!-- PROJECT_CONFIG
runtime: python-uv
test_command: cd pipeline-service && uv run pytest
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-pipeline-skeleton
section-02-fastify-pipeline-client
section-03-legacy-equivalent-ops
section-04-embedding-and-prompt
section-05-ml-models-spike
section-06-fusion
section-07-agreement-and-diagnosis
section-08-mobile-rewrite
section-09-eval-rig
section-10-cleanup-cutover
END_MANIFEST -->

# Implementation Sections — Detection Pipeline Structural Rewrite

This index splits [claude-plan.md](../claude-plan.md) +
[claude-plan-tdd.md](../claude-plan-tdd.md) into 10 implementable
sections. Each section file in this directory contains:

- A self-contained problem statement (no need to re-read the master plan)
- The relevant slice of [claude-plan.md](../claude-plan.md) (file paths, types, contracts)
- The relevant slice of [claude-plan-tdd.md](../claude-plan-tdd.md) (failing tests to write first)
- A "done" checklist
- Per-section test command (because this repo is polyglot — see note below)

> **Polyglot note.** PROJECT_CONFIG declares `python-uv / cd pipeline-service && uv run pytest`
> because the pipeline-service is where most NEW code and tests live. Sections that
> touch `api-service/` (TypeScript/Vitest) or `mobile-app/` (Flutter) state their own
> test commands inline.

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
| --- | --- | --- | --- |
| section-01-pipeline-skeleton | — | 02, 03 | first; alone |
| section-02-fastify-pipeline-client | 01 | 03, 08 | parallel with later 04+ once shipped |
| section-03-legacy-equivalent-ops | 01, 02 | 04 | parallel with 08 |
| section-04-embedding-and-prompt | 03 | 05, 06 | — |
| section-05-ml-models-spike | 04 | 06 | spike-gated; if spike fails, fallbacks |
| section-06-fusion | 04, 05 | 07 | — |
| section-07-agreement-and-diagnosis | 06 | 09 | — |
| section-08-mobile-rewrite | 02 | 09 (helpful), 10 (gates) | parallel with 03–07 |
| section-09-eval-rig | 07, 08 (helpful) | 10 | — |
| section-10-cleanup-cutover | 07, 08, 09 (two green eval runs) | — | last |

## Execution Order (with parallelism)

1. **section-01-pipeline-skeleton** (no deps)
2. **section-02-fastify-pipeline-client** (after 01)
3. **section-03-legacy-equivalent-ops** + **section-08-mobile-rewrite** (parallel after 02)
4. **section-04-embedding-and-prompt** (after 03)
5. **section-05-ml-models-spike** (after 04 — Apple-Silicon spike gates this)
6. **section-06-fusion** (after 04 + 05)
7. **section-07-agreement-and-diagnosis** (after 06)
8. **section-09-eval-rig** (after 07; ideally after 08 for real-frame regression)
9. **section-10-cleanup-cutover** (after 07 + 08 + two consecutive green eval runs from 09)

## Section Summaries

### section-01-pipeline-skeleton
New `pipeline-service/` Python project. FastAPI sidecar with `POST /runs`,
`GET /runs/:id`, `GET /runs/:id/wait` (long-poll), `GET /runs/:id/timeline`.
Dagster `Definitions` in-process via `materialize()` — no daemon. Idempotency
keying on `sha256` of concatenated frame hashes. 503 backpressure with
`max_queue_depth`. Model warm-up stubbed (loaders are no-op until later
sections add real models). `DAGSTER_HOME=~/allmythings-data/dagster` and
nightly retention schedule. `frame_intake` (list of frames) and
`assemble_result` ops with explicit empty-set semantics; all middle ops are
typed pass-through stubs. `start-pipeline.sh` health-checks Florence + Ollama
before starting. Includes log-redaction infrastructure that later sections
plug VLM outputs into.

Plan refs: §1, §2 (`pipeline-service/` tree), §3.0, §3.1, §3.15, §4.2,
§8.2–8.4, §11.6.
TDD refs: §3.0, §3.1, §3.15, §4.2 (sidecar API + idempotency + 503),
§8 (log redaction infra, retention).

### section-02-fastify-pipeline-client
Adds `api-service/src/clients/pipeline.client.ts` wrapped by the **kept**
`circuit-breaker.ts`. `launchRun()`, `getRun()`, `waitForCompletion()` —
the last uses long-poll first (250 ms→2 s exponential cap on fallback,
total RPS ≤ 5/s/run). `USE_PIPELINE_SERVICE` env-var feature flag in
`detect.route.ts` and `detect-status.route.ts`: when on, calls pipeline.client;
when off, current Temporal client. Adds 503/Retry-After path for
`queue_full`. Adds the Phase-5 lint that fails CI if the flag lingers
past acceptance. Adds new `api-service/src/types/pipeline.ts` (TS mirrors
of §5.1).

Plan refs: §1 (Fastify keeps; circuit-breaker kept), §2 (api-service tree),
§4.1, §4.2, §4.3, §5.1, §10 Phase 2.
TDD refs: §4.1, §4.2 (pipeline.client.ts), §4.3.
Test command: `cd api-service && npm test`.

### section-03-legacy-equivalent-ops
First two real ops in the Dagster DAG: `florence_detect` (HTTP shim of
existing `detection-service/`) and `classification_refine` (Qwen-VL tier
chain ported from current Temporal worker, with the new Ollama
single-flight semaphore in `models/ollama_client.py`). At end of section:
the Dagster path produces results equivalent to today's Temporal path on
single Florence + Qwen tier chain. Side-by-side regression check on a tiny
shared corpus: criterion is *same set of primary labels per scene at
IoU ≥ 0.5 and roughly equivalent count* — NOT metric parity (Temporal's
`EnrichedItem` has no `contributingSignals`).

Plan refs: §3.4, §3.12, §3.0 (Ollama semaphore), §10 Phase 3.
TDD refs: §3.4, §3.12.

### section-04-embedding-and-prompt
Adds the embedding + prompt plumbing: `scene_embedding` (DINOv2 ViT-B/14,
768-d float16, MLX), `vlm_prompt_expansion` (two-seed: Qwen-VL + Florence
captions, with cache bypass on `embedding_failed`), `crop_embedding` (DINOv2
+ int8 quantisation for on-device storage). Includes the prompt cache
keyed by `hash(round(median_scene_embedding, 3 dp))` with an explicit
bypass path for failed embeddings (regression for the zero-vector
collision bug).

Plan refs: §3.2, §3.3, §3.9, §10 Phase 4a, §11.1 (DINOv2 ceiling).
TDD refs: §3.2, §3.3, §3.9.

### section-05-ml-models-spike
**Apple-Silicon spike + the riskiest ops**: `grounding_dino_detect`,
`sahi_recovery`, `effsam_segment`. The §11.1 spike runs first as a
dedicated integration test that the section MUST pass before producing
production ops. If the spike fails (latency / memory ceiling exceeded),
the section's fallback path is triggered: OWLv2-Base ONNX or YOLO-World-S
int8 for gdino; MobileSAM for segmentation. Contracts don't change.

Plan refs: §3.5, §3.6, §3.7, §10 Phase 4b, §11.1.
TDD refs: §3.5, §3.6, §3.7, §11.1 spike acceptance.

### section-06-fusion
Box fusion + dedup: `box_fusion` (WBF with detector weights
`{florence:0.5, gdino:1.0, gdino-sahi:0.8}`, deterministic input ordering,
empty-set semantics), `cross_pass_dedup` (within-frame), `cross_frame_dedup`
(across the burst). Includes `label_text_compat()` using
`sentence-transformers/all-MiniLM-L6-v2` as a **negative gate** at threshold
0.6. Adversarial fixture set committed at
`pipeline-service/tests/replay/fixtures/label_compat_pairs.json`.

Plan refs: §3.8, §3.10, §3.11, §10 Phase 4c.
TDD refs: §3.8, §3.10, §3.11 + label_text_compat parametrised tests.

### section-07-agreement-and-diagnosis
Gating math: `agreement_scoring` (signal-class grouping where
Florence and gdino share `"first_pass"` class — regression for the §6.1
bug; tiled and per-frame as separate classes; `single_source_run` flag;
empty-detection-set math returning 0.0 not NaN; non-blank scene check via
scene_embedding norm), `self_diagnosis` (`DynamicOut` fan-out in same DAG;
strictness ladder where Level 2 uses additive delta `θ_new = max(θ - 0.05,
0.7)` — regression for the "halve" bug; no-improvement bail-out;
MAX_RERUNS=2 cap with `diagnosis_budget_exhausted` flag).

Plan refs: §3.13, §3.14, §6.1–6.4, §10 Phase 4d.
TDD refs: §3.13, §3.14, §6.

### section-08-mobile-rewrite
Mobile rewrite (Flutter): `image_quality.dart` (Laplacian + histogram),
`face_redaction.dart` (ML Kit, with **mandatory original-frame zeroing**
after encoding), `burst_capture.dart` (3-frame burst, send all 3),
`upload_encoder.dart` (WebP @1280 px, EXIF strip, original disposal),
`camera_capture_screen.dart` rewrite, `detection_providers.dart`
simplification (drop CoreML branch). Drift schema rebuilt to v5
(`detection_labels` denormalised for FTS; no `inventory_items.sceneId`;
no `scenes.proposedPromptList`; int8-quantised `cropEmbeddingI8`).
**Mandatory** `item_detail_screen.dart` null/empty audit. CoreML deletion
list enumerated and removed (iOS + Android).

Plan refs: §1 (mobile diagram), §2 (mobile tree), §5.3 (Drift v5),
§9.1–9.5, §10 Phase 6, §11.5.
TDD refs: §5.3, §9 (every subsection).
Test command: `cd mobile-app && flutter test && flutter test integration_test`.

### section-09-eval-rig
Adds `pipeline-service/eval/run_eval.py`, `metrics.py`, `thresholds.json`,
gitignored `corpora/` directory, and `make eval` integration. **First task
of this section is the starter-corpus capture protocol**: 5 rooms × 3
angles × 2 captures = 30 scenes, each scene a 3-frame burst. Until corpus
exists, `make eval` reports without gating. After corpus exists, CI gates
on `agreement_coverage ≥ 0.70`, `dedup precision ≥ 0.88`, `op_failure_rate
≤ 0.05`. The `make smoke` script gains a one-scene synthetic burst that
runs the full DAG.

Plan refs: §7, §10 Phase 7.
TDD refs: §7.

### section-10-cleanup-cutover
**Final section, Phase 5 of the plan.** Gating preconditions: section-08
mobile shipped on new `SceneObservation` shape, AND two consecutive green
`make eval` runs from section-09 corpus. Then: delete
`api-service/src/temporal/`, `api-service/src/providers/`,
`api-service/src/schemas/detection.schema.ts`,
`api-service/src/services/image-quality.service.ts`,
`api-service/src/services/translation/`, `TEMPORAL_*` and `TIER_*` env vars,
the `USE_PIPELINE_SERVICE` flag. **Keep** `circuit-breaker.ts` (wired
around pipeline.client). Update CLAUDE.md to reflect the new architecture.
Phase-gate lint scripts that fail CI if any of the deletions regresses.

Plan refs: §10 Phase 5, §11.7.
TDD refs: §10 phase-gate lints + scripts/smoke-assertions.ts done-criteria.
Test command: `make verify` (runs lint + unit tests across both services).
