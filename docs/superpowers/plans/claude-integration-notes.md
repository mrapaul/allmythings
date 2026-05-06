# Integration Notes — Opus Review iteration-1

Date: 2026-04-29
Review: [reviews/iteration-1-opus.md](reviews/iteration-1-opus.md)
Verdict: "Ship with specific fixes" — 12 named bugs + architectural omissions.

This document records what is being integrated, what is being declined,
and the rationale for each. The plan update follows immediately after.

## Integrating (all 12 named bugs + architecture fixes)

### The 12 named bugs / contradictions

| # | Issue | Decision | Plan changes |
| --- | --- | --- | --- |
| 1 | DINOv2 dim mismatch (ViT-S/14 384-d vs declared 1024-d) | **Integrate.** Pick **DINOv2 ViT-B/14 → 768-d float16**, the realistic Apple-Silicon choice via MLX. | §3.2, §5.1 (`vector_768_f16`), §5.2, §5.3 (`cropEmbedding` now ~1.5 KB int8 quantised on device per fix #6 in arch list below) |
| 2 | Florence `score=1.0` accounting contradiction | **Integrate.** Reconcile as: Florence and gdino are **both** "first-pass detectors" — they count as ONE signal-source-class in agreement scoring. SAHI and (v2) multi-frame are the additional independent signal classes. | §3.4 + §3.8 + §6.1 |
| 3 | §6.4 Level 2 "halve θ" | **Integrate.** Restate as additive delta `θ_new = max(θ - 0.05, 0.7)`. | §6.4 |
| 4 | Redundant `sceneId` on `inventory_items` and `detections` | **Integrate.** Drop `inventory_items.sceneId`. `detections.sceneId` is the canonical FK. | §5.3 |
| 5 | `label_search_fts` over JSON `alternateLabels` | **Integrate.** Denormalize: new `detection_labels (detectionId, label, confidence, isPrimary BOOL)` child table; FTS over its `label`. | §5.3 |
| 6 | Empty-detection-set math (NaN coverage) | **Integrate.** Define: when detection count is 0, `agreement_coverage = 0.0, agreement_precision = 0.0`. Self-diagnosis force-rerun if count is 0 AND scene is not blank (scene_embedding norm > ε). | §3.13, §3.14 |
| 7 | Prompt cache + zero-vector embedding failure → cache collision | **Integrate.** When `scene.embedding_failed`, **bypass** the prompt cache entirely (always run prompt expansion live). | §3.3 |
| 8 | `waitForCompletion` polling cadence | **Integrate.** Specify the cadence: **exponential 250 ms → 2 s, capped, plus a long-poll endpoint** `GET /runs/:id/wait?timeout=Ns` exposed by the FastAPI sidecar that internally awaits run completion (Dagster instance event subscription). Fastify uses long-poll first; falls back to short-poll on timeout. | §4.2, §4.3 |
| 9 | Self-diagnosis sub-runs ↔ Dagster reality | **Integrate.** Commit to **DynamicOut**: rerun is materialised as a dynamic op output in the *same* DAG, lineage visible in Dagster UI without sub-run dispatch. No daemon required. | §3.14 |
| 10 | Phase 5 (delete Temporal) before Phase 6 (mobile rewrite) → type-mismatch regression | **Integrate.** Reorder: **Phase 5 happens after Phase 6.** Mobile must be on the new `SceneObservation` shape before Temporal is deleted. As a belt-and-braces, add a Fastify legacy-shape **translation layer** active until Phase 6 completes. | §10 |
| 11 | WBF detector weights unspecified | **Integrate.** Default: `florence=0.5, gdino=1.0, gdino-sahi=0.8`. Configurable. | §3.8 |
| 12 | Label-text-embedding encoder & threshold unspecified | **Integrate.** Use **`sentence-transformers/all-MiniLM-L6-v2`** (small, runs CPU/MPS, 384-d). Threshold: dedup *requires* `crop_emb_cos ≥ θ_scene` AND `label_text_cos ≥ 0.6`. Label-text only used as a **negative gate** — it never *triggers* a merge, only blocks one. Adversarial pair test fixtures committed. | §3.11 |

### Architectural omissions / additions

| Item | Decision | Plan changes |
| --- | --- | --- |
| Dagster execution model (in-process vs daemon) | **Pin in-process via FastAPI.** Sidecar imports `Definitions` and runs jobs via `materialize()`. No daemon. UI still works against shared instance storage. | §1, §3, §11.6 |
| `QueuedRunCoordinator` cap | **Integrate.** `max_concurrent_runs = 1` initially (the GPU/Neural Engine is shared with Ollama and Florence — no parallelism win). Documented; tunable. | §1, §11.6 |
| Backpressure to mobile (503 Busy) | **Integrate.** Sidecar emits queue depth; Fastify returns 503 when queue depth > N. Mobile already retries 503 with backoff. | §4.2, §4.3 |
| Replay tests in Dagster (Temporal had real replay) | **Integrate.** Define replay as **op-level pytest replay**: golden JSON I/O fixtures per op, deterministic re-invocation. Not Dagster-native replay. | §3 (preface), §10 Phase 1 |
| Idempotency at pipeline-service | **Integrate.** `POST /runs` accepts `idempotency_key` (= image SHA-256). If a run is already in `running` or `succeeded` state for the same key, return its existing `runId`. | §4.2 |
| Dagster instance storage location + retention | **Integrate.** `DAGSTER_HOME=~/allmythings-data/dagster`, retention = last 200 runs (cleanup script run nightly via Dagster schedule). | §11.6 |
| Model warm-up on service start | **Integrate.** Sidecar startup task does a forward pass on a 1×1 black image through every model. Mobile warm-up rule: first capture after `make start` may take longer; surface as a known good-start. | §1, §10 Phase 1 |
| `make start` ordering | **Integrate.** `start-pipeline.sh` health-checks Florence and Ollama before starting Dagster. | §10 Phase 1 |
| Keep circuit-breaker on Fastify side | **Integrate.** Don't delete `circuit-breaker.ts`. Wire it as the gate around `pipeline.client.ts` calls. | §2, §10 Phase 5 |
| Mobile CoreML deletion file enumeration | **Integrate.** §2 explicitly names the files to delete (Phase 6 task). Discovery happens during Phase 6 spike — list provided as part of execution, but the *commitment* is in the plan. | §2, §9.3 |
| Mobile face redaction: discard original | **Integrate.** Original-resolution frame is dropped from memory immediately after WebP encoding; only the redacted WebP is retained. State explicitly. | §9.1, §9.2 |
| Log-redaction policy | **Integrate.** `vlm_prompt_expansion` and `classification_refine` outputs are redacted in logs (only `len`, top-3 token sample, structural shape — not full content). Pino + Python loggers configured with redactors. | §8 (new subsection) |
| Eval starter-corpus seeding task | **Integrate.** Phase 7 first task = "capture 30 starter scenes (5 rooms × 3 angles × 2 captures)". CI gating only activates after the corpus exists. Until then, `make eval` reports but does not gate. | §10 Phase 7 |
| Phase 5 irreversibility + rollback gate | **Integrate.** "Two consecutive green eval-rig runs against the captured corpus" is the deletion gate. Stated explicitly. | §10 Phase 5 |
| `ContributingSignal.rawConfidence` Optional | **Integrate.** Type becomes `number \| null`; Florence emits null. | §5.1, §5.2 |
| Phase 4 split into 4a/4b/4c/4d | **Integrate.** | §10 Phase 4 |
| Scene `proposedPromptList` storage on device | **Integrate.** Drop `scenes.proposedPromptList` column. The list is debug data; the Dagster run stores it; the mobile inventory doesn't need it. | §5.3 |
| Cross-device sync explicit non-goal | **Integrate.** Already implied by interview Q3, but state in §11. | §11 (new subsection) |
| `cropEmbedding` storage budget on device | **Integrate.** Quantise to **int8** on device (768 B/vector); raw float16 stays server-side per run only. Stated SQLite budget: <50 MB for 1000 detections. | §5.3, §3.9 |
| On-device similarity search | **Integrate as explicit non-goal v1.** Drift stores embeddings for future use; no on-device index in v1. | §11 |
| Self-diagnosis no-improvement bail-out | **Integrate.** If `coverage(rerun_k) ≤ coverage(rerun_{k-1})`, terminate and emit the previous result. | §3.14, §6.4 |
| `agreement_scoring` "single source run" detector | **Integrate.** If the run effectively had only one independent signal source (e.g., Florence-only because gdino + prompt-expansion both fell back to Florence), emit `flagged=True, flag_reason="single_source_run"` regardless of coverage. | §3.13 |
| Ollama parallelism semaphore | **Integrate.** `models/ollama_client.py` includes a single-flight asyncio semaphore — only one Ollama call in flight at a time per model. Eats latency, prevents memory thrash. | §3 (preface), §11.1 |
| Apple-Silicon spike memory ceiling | **Integrate.** Spike acceptance criterion: total resident memory of (Florence + gdino + EffSAM + DINOv2) ≤ 6 GB on a 16 GB Mac. If exceeded, fall back to fewer detectors or smaller variants. | §11.1 |
| EfficientSAM end-to-end (not per-crop) latency | **Integrate.** Spike measures 30-box scene end-to-end. | §11.1 |
| Empty-set semantics for box_fusion / crop_embedding / cross_pass_dedup | **Integrate.** Each numeric op explicitly defines its output for empty input. | §3.8, §3.9, §3.10 |
| `box_fusion` deterministic ordering | **Integrate.** Inputs sorted `(detector, frame_id, label, x, y)` before WBF. | §3.8 |
| `assemble_result` exception handling | **Integrate.** Try/except in op body; on raise, emit minimal-valid `SceneObservation` with `flagged=True` and the exception summary in `errors[]`. | §3.15 |
| `sahi_recovery` tile errors structured | **Integrate.** `FrameDetections` gains `tileErrors: [{tile_index, code, message}]`; >50 % tile failure rate elevates to run-level warning. | §3.6, §5.1 |
| `classification_refine` empty attributes mobile audit | **Integrate as Phase 6 task.** Explicit checklist item to audit `item_detail_screen.dart`. | §10 Phase 6 |

### Multi-frame upload in v1

The reviewer's strongest point in §2d. The plan says v1 sends one frame
even though the burst captures 3. That makes cross-frame dedup vacuous
and caps agreement_score at 3 (florence + gdino + sahi when sahi fires).

**Decision:** **upload all 3 burst frames in v1.** The mobile already
captures them. Sending them costs ~3× bandwidth and ~3× server work,
but unlocks the multi-frame agreement signal that the entire
"agreement-as-truth" thesis depends on. The user's interview Q8 said
"multi-frame burst + best-frame pick" but they were answering a
different question (capture quality), not "should we upload them all".
The integration upgrades v1 to multi-frame upload because it materially
changes whether agreement-as-truth works at all.

Plan changes: §1, §3 (frame_intake accepts list), §3.11 (cross-frame
dedup is real now), §6.1 (signals = `(detector, frame_id)` pairs),
§9.1 (mobile sends all 3 frames in one multipart upload).

## Declining

Nothing material is declined. A few items were already in the plan
in spirit (e.g., the Apple-Silicon spike already exists at §11.1; the
review asked for sharper acceptance criteria, which I'm integrating
rather than declining).

## Summary

All 12 named bugs are fixed. All architectural omissions are addressed.
v1 is upgraded to multi-frame upload to make agreement-as-truth real.
Phase ordering is adjusted to remove the regression window. Dagster
execution is pinned to in-process to remove the daemon ambiguity.

Plan update follows.
