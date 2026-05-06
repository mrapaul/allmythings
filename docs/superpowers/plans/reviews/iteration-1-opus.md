# Opus Review

**Model:** claude-opus-4
**Generated:** 2026-04-29T (deep-plan opus_subagent mode)

---

# Senior Architect Review — claude-plan.md

## Verdict up front
**Ship with specific fixes.** The plan is structurally sound and significantly better than the existing Temporal stack, but it has several load-bearing gaps that will bite during execution. Most are concentrated around (a) the agreement-as-truth math, (b) self-diagnosis recursion mechanics in Dagster, (c) the Fastify↔Dagster boundary, and (d) Apple-Silicon viability assumptions. None are fatal; all are fixable in-place before code lands.

---

## 1. Architectural correctness — Dagster + Fastify split

**The split is reasonable but the boundary is underspecified.**

- **§4.2 `POST /runs` returns 202 only.** Fine, but §4.3 says `detect.route.ts` calls `launchRun()` then `waitForCompletion()` with a deadline. That means Fastify must **poll Dagster** to honor the existing 200-within-90s contract. The plan never specifies the polling interval, and the Dagster GraphQL/REST API isn't free — at 1 Hz across concurrent captures you'll hammer the Dagster webserver. **Fix:** specify polling cadence (e.g., 500ms→2s exponential), or expose a long-poll endpoint in the FastAPI sidecar that internally awaits a Dagster run completion event.

- **No mention of how the FastAPI sidecar actually launches and observes Dagster runs.** Dagster's run-launching API (`dagster_graphql.client.DagsterGraphQLClient` or the Python launcher API via `RepositoryLocation`) is non-trivial. There's also a choice between in-process execution (cheap, no daemon) and out-of-process via the Dagster daemon. The plan defaults to "Dagster webserver + daemon" (§11.6) without justifying why a personal Mac needs the daemon. **Fix:** §3 or §4.2 must commit to either (a) FastAPI sidecar imports the Dagster `Definitions` and runs jobs in-process via `materialize()`/`execute_in_process()` (simpler, no daemon, faster startup), or (b) goes through the daemon (heavier, gains persistent run history and the UI runs page automatically). For a single-user Mac, option (a) is dramatically simpler — and the UI still works because Dagster will load run history from the same instance storage.

- **Concurrent runs are unbounded.** Nothing in §3/§4 caps how many simultaneous Dagster runs can hit the same DINOv2/EffSAM/Florence/Ollama backends. With models loaded once and kept warm (§1), parallel runs will contend for the same GPU/Neural Engine. **Fix:** add a Dagster `run_coordinator` configured as `QueuedRunCoordinator` with `max_concurrent_runs=1` (or 2), and document that Fastify will see queueing tail latency.

- **No backpressure to the mobile.** Fastify has no `503 Busy` semantic if Dagster's queue is deep. Combined with mobile's exponential retry on 503/429 (already implemented per recent commits), Fastify should emit 503 when the Dagster queue exceeds N. **Fix:** add to §4.2 a sidecar-emitted "queue depth" hint and a Fastify gate.

- **Loss of replay-test discipline is not adequately replaced.** The Temporal stack today has `record-happy-path.ts` + `detect-inventory.replay.test.ts` — deterministic event-history replay tests. The plan mentions "replay tests" in `pipeline-service/tests/replay/test_op_replay.py` (§2) but doesn't define what "replay" means in Dagster terms. Dagster has no event-history replay analogous to Temporal. **Fix:** §3 must commit to "op-input/output JSON fixtures recorded once on a golden corpus, replayed by re-invoking the op directly with the recorded inputs and asserting deterministic outputs" — that's not Dagster replay; it's plain pytest replay. State this explicitly.

---

## 2. Agreement-as-ground-truth — failure modes the mitigations don't cover

The plan acknowledges the obvious self-confirming risk (§11.2). It misses several less-obvious ones:

### 2a. Florence's `score=1.0` poisons the agreement count
§3.4: "Florence doesn't return scores; calibrated downstream by agreement, not by the raw detector." §3.8 says Florence's 1.0 is "treated as 'present, no signal' — counted as one corroboration but not weighted higher." But in §6.1, agreement_score = `len(unique(signals))`, where a signal is `(detector, frame_id)`. **Florence is always one corroborating signal for everything it emits.** This means every Florence-region that gets even one weak gdino/sahi corroboration jumps to score=2 → confidence=0.5. That's a free pass. The "no weight" claim in §3.8 contradicts the "1 unique signal" treatment in §6.1. **Fix:** either (a) require ≥2 *non-Florence* signals to count as score=2, or (b) treat Florence and gdino as one signal-source-class (since both are "first-pass detectors") and only count SAHI/multi-frame as additional independent signals.

### 2b. Prompt expansion is correlated with the detector that consumes it
The VLM (qwen2.5vl:7b) generates the prompt list (§3.3). That same Qwen tier later does classification refinement (§3.12). Grounding DINO uses the prompts to detect. So Qwen biases what gdino *can possibly find*, and then Qwen *re-confirms it*. This is not multi-model agreement; it's circularity. **Fix:** the rerun ladder (§6.4 Level 1) re-asks the VLM with a paraphrase, but the *first pass* should itself include a paraphrase from a different VLM tier (moondream) or use Florence captions as the *primary* prompt seed and Qwen as augmentation. State this in §3.3.

### 2c. "Agreement-coverage = 1.0 with zero detections" mitigation is incomplete
§11.2 says the eval rig flags zero-detection coverage=1 scenes. But the mitigation lives in the eval rig, not in the *runtime* self_diagnosis op. A live capture that returns 0 detections will go through self_diagnosis with `agreement_coverage = 0/0` (NaN or defined-as-1). **Fix:** §3.13 must define the math for empty detection sets explicitly (e.g., coverage and precision = 0 when detection count is 0), and §3.14 must include "if detection_count == 0 AND scene_embedding shows scene is not blank, force rerun at Level 1 strictness."

### 2d. Cross-frame dedup is theoretical for v1
§3.11: "Maintain a FAISS in-memory index for the run. For each frame's detections, look up the K=3 nearest neighbours from already-seen detections." But §1 says v1 uploads only one frame per capture. So cross-frame dedup runs against an empty index. The "agreement_score grows further" claim from multi-frame in §6.1 is unrealised in v1 — meaning **v1's agreement signal is at most 3** (florence, gdino, gdino-sahi), and gdino-sahi only fires conditionally. Realistic v1 agreement_score will be 2 for most detections, putting confidence at 0.5 on essentially everything. **Fix:** either commit to multi-frame upload in v1 (the mobile already captures the burst — §9.1 says it's kept in memory; sending all 3 is a small change), or document that v1 confidence will saturate at ~0.5 and that gating thresholds in §6.3 will be tuned accordingly.

### 2e. Label-text-embedding compatibility (§3.11) is unspecified and risky
"Compatibility is embedding-driven — we compare label-text-embeddings, not class IDs." But the plan does not say *which* text encoder, what threshold, what corpus it's evaluated on, or whether unrelated nouns ("plant", "vase") might cluster. Text embeddings of single nouns are notoriously unstable. **Fix:** §3.11 must specify the encoder (e.g., `all-MiniLM-L6-v2` or sentence-transformers / SigLIP text head), threshold (e.g., cos > 0.85), and add a unit test with adversarial pairs ("table"/"chair", "sofa"/"couch", "lamp"/"light"). Better yet: keep the FAISS-on-crop-embedding match as the dominant signal and use label compat only as a *negative gate* (refuse merges when text-cos < 0.6).

### 2f. WBF needs per-detector confidence weights you don't have
§3.8 states `iou_thr=0.5, skip_box_thr=0.0`. WBF requires per-detector weights to fuse meaningfully; the plan never assigns them. With Florence's hard-coded 1.0, WBF will systematically prefer Florence boxes. **Fix:** assign explicit detector weights (e.g., florence=0.5, gdino=1.0, gdino-sahi=0.8) in `config.box_fusion`.

---

## 3. Apple-Silicon viability — concrete risks to spike-test before committing

The plan handles this *better* than most plans (§11.1 names a 1-day spike), but understates several specific risks:

- **Grounding DINO 1.5 Edge has no first-class CoreML or MLX port as of late 2025.** ONNX-Runtime CoreML EP partially supports it but typically falls back to CPU for the BERT text encoder, killing throughput. The TensorRT model in the original release is non-portable. **Fix:** the §11.1 spike must explicitly measure: (a) ONNX-RT CoreML EP latency for both image encoder and text encoder paths, (b) MPS fallback path via PyTorch as a baseline, (c) memory consumption (the swin-T variant pushes ~2GB resident — combined with EffSAM and DINOv2 you're past 8GB, problematic on 16GB Macs). Add memory ceiling as an explicit spike acceptance criterion.

- **EfficientSAM-Ti is "ViT-tiny" in name only.** Its image encoder is small but the prompt-encoder/decoder loop runs once per box. With 30+ boxes per scene this is **not the 50ms/crop** quoted in research §B1. **Fix:** spike must measure end-to-end EfficientSAM latency for a 30-box scene, not per-crop.

- **DINOv2 the plan flips between ViT-S/14 (§3.2 "Base ViT-S/14"), 1024-d in code (§5.2 says `vector` is 1024-d, but ViT-S/14 outputs 384-d, ViT-B/14 → 768-d, ViT-L/14 → 1024-d).** This is a real bug: the typed contract in §5.1 declares `vector_1024_f16`, but §3.2 says ViT-S/14. **Fix:** pick one, fix the type. Realistic Apple-Silicon choice is ViT-B/14 (768-d) via the official MLX port — update both the prose and the typed contract.

- **No statement on Ollama parallelism.** The pipeline calls qwen2.5vl:7b (prompt expansion + classification refine), and the existing tier chain. Ollama serializes per-model on a single GPU. Multiple ops running in parallel within one Dagster run will deadlock or starve. **Fix:** add an Ollama-aware coordinator (single-flight or in-process semaphore) in `models/ollama_client.py`, and call it out in the spike.

---

## 4. Self-diagnosis recursion — coherence and divergence risk

§3.14 + §6.4 specify a 3-level strictness ladder bounded at MAX_RERUNS=2 (so levels 1 and 2 used; level 3 = give up).

**Issues:**

- **Level 2 halves `crossFrameEmbeddingTheta` ("more aggressive dedup merging").** Halving 0.85 gives 0.425 — that will collapse most distinct objects together. Probably the author meant "lower θ" (e.g., 0.85 → 0.75) not "halve". This is a real bug. **Fix:** specify additive/multiplicative deltas explicitly, e.g., `θ_new = max(θ - 0.05, 0.7)`.

- **Lowering `gdino_score_thr` AND lowering dedup θ AND expanding prompts simultaneously is a recipe for *more* low-quality detections.** The metrics that triggered the rerun (low coverage/precision) measure agreement, not raw count. A flood of new low-confidence detections will only marginally improve coverage if at all. **Fix:** the rerun ladder needs an explicit rationale for each delta. Specifically: lowering the detector threshold doesn't help coverage — coverage is a ratio. It only helps if the new detections corroborate existing ones (more signals on existing boxes), which is a different question from "find more".

- **Could it diverge or oscillate?** Not strictly diverge given MAX_RERUNS=2, but it can produce non-monotone metrics: rerun 1 might lower coverage by introducing many new singleton detections. Then rerun 2 fires anyway because the bound is on rerun_depth, not on metric improvement. **Fix:** add a "no improvement → bail early" check: if rerun_k coverage ≤ rerun_(k-1) coverage, terminate and emit the previous result, not the latest. State this in §3.14.

- **Sub-run lineage in Dagster:** §3.14 says reruns are "sub-jobs" with `runId.rerun_1` semantics. Dagster has no first-class concept of nested runs producing parent results. The standard pattern is dynamic-graph-output (`DynamicOut`) or a graph that includes the rerun as a conditional branch. **Fix:** §3.14 must commit to one of: (a) op-internal loop (hides lineage but easiest), (b) `DynamicOut` materializing rerun ops in the same DAG (cleanest), or (c) actual sub-run dispatch (most complex, requires daemon and is what the plan implies but doesn't deliver). Given §11.6 is ambivalent on the daemon, (b) is the right answer.

---

## 5. Cutover sequencing (§10) — regression windows

Phase order is mostly OK but has problems:

- **Phase 5 (delete Temporal) lands before Phase 6 (mobile rewrite).** That's a real regression window: while Phase 6 is in flight, the mobile sends the *current* multipart payload to a backend that has ripped out Temporal. As long as the Fastify routes are unchanged externally and the new pipeline produces a `SceneObservation` that the *old* mobile can parse… but it can't, because §5.1's `SceneObservation` is a strict superset and the old mobile expects `DetectResult{itemCount, items, errors}`. **Fix:** either (a) keep `EnrichedItem`/`DetectResult` shape support in Fastify as a translation layer until mobile lands, or (b) reorder so Phase 6 happens *before* Phase 5.

- **Phase 2's feature flag `USE_PIPELINE_SERVICE`.** Useful, but the plan never says how the flag is exposed (env var? config endpoint? per-request header?). And the dual code paths means *both* clients (Temporal + pipeline) live in the codebase concurrently — a lint/dead-code risk if Phase 5 doesn't follow promptly. **Fix:** specify the flag mechanism and add a "must remove flag in Phase 5" checklist.

- **Phase 3 says "Per-op tests with fakes" and "compare both paths against the eval corpus".** But the eval corpus (§7.1) is "captured during execution" and the eval rig metrics (agreement_coverage, etc.) **don't apply to the legacy Temporal output** — Temporal's `EnrichedItem` lacks `contributingSignals`. So a side-by-side comparison is impossible. **Fix:** Phase 3's comparison criterion should be "same set of primary labels per scene at IoU>=0.5 and roughly equivalent count" — a regression check, not a metric parity check. State this.

- **Phase 4 implements 11 new ops in one phase.** That's the heaviest phase, with the riskiest models, and it's untimed. **Fix:** split into 4a (scene_embedding + vlm_prompt_expansion + crop_embedding — DINOv2 + Qwen plumbing), 4b (grounding_dino + sahi + effsam — Apple-Silicon-risky models), 4c (box_fusion + cross_pass_dedup + cross_frame_dedup — fusion logic), 4d (agreement_scoring + self_diagnosis — gating math).

- **Phase 1's "stub middle ops as pass-through".** What does "pass-through" mean for `box_fusion` (no detections to fuse)? `agreement_scoring` (no signals)? The empty-set semantics need explicit handling, otherwise Phase 1 ships a SceneObservation with NaN coverage and the mobile breaks parsing. **Fix:** specify "pass-through ops emit empty FrameDetections / FusedFrame / EmbeddedFrame as appropriate; agreement_scoring on empty input emits coverage=0.0, precision=0.0".

---

## 6. Drift schema — server-side concerns pushed to mobile

A few of these are real:

- **Cross-device deduplication is impossible.** With inventory only on Drift, a user who reinstalls the app or uses a second device starts from zero. The plan doesn't acknowledge this — it's an explicit user choice (interview Q3) but the consequence should be in §11.

- **`cropEmbedding` BLOB on every detection row is heavy on a phone.** A 1024-d float16 vector = 2KB; 30 detections × 100 scenes = 6MB just in embeddings. Manageable but should be acknowledged. **Fix:** state SQLite size budget and consider quantising to int8 (256B/vector) for the on-device copy.

- **No FAISS index on the device.** Mobile can never re-do dedup or scene-similarity locally. If the user wants to ask "find this object I just photographed in my existing inventory", the embeddings exist but there's no index. **Fix:** either (a) explicitly de-scope on-device search (server is gone, so the feature is gone), or (b) add `objectbox` or a tiny brute-force search over Drift BLOBs.

- **`scenes.proposedPromptList` as JSON on device serves no UI purpose stated in the plan.** Why is the mobile storing the prompt list? **Fix:** either delete the column or document the use case.

- **`alternateLabels` JSON column doesn't go through FTS.** §5.3 says "FTS extended to alternate_labels", but Drift FTS5 indexes columns, not JSON paths. To FTS-index alternates, you'd either flatten them into a TEXT column or denormalize into a child table. **Fix:** denormalize into `detection_labels (detectionId, label, confidence, isPrimary BOOL)` so FTS works.

- **`itemId` FK on detections + `sceneId` FK creates ambiguity.** Is it 1:1 (item per scene) or N:1 (detections under one item)? §9.4 says "one inventory_items row + one scenes row + N detections rows" — so an `item` is the scene-level aggregate. Then `inventory_items.sceneId` is redundant with `detections.sceneId`. **Fix:** drop one. If `inventory_items` is the scene aggregate, just call it `scenes` and let `detections.sceneId` be the only FK.

---

## 7. Op contract failure-semantics composition

A few non-composing failures:

- **`scene_embedding` "on final fail, return zero-vector + flag".** Downstream `vlm_prompt_expansion` keys cache by `hash(round(scene_embedding, 3 dp))` — a zero-vector hash will collide across all failed scenes, returning whatever cached prompt list was generated for the first failure. **Fix:** when `scene.embedding_failed`, *bypass* the cache entirely.

- **`grounding_dino_detect` failure ("Florence-only fallback") combined with `vlm_prompt_expansion` failure ("Florence-captions fallback").** Both fallbacks use Florence. If Florence has any issues, both ops degrade simultaneously and the agreement-signal collapses to a single source. The pipeline will pass self-diagnosis (because everything technically returns) but emit garbage. **Fix:** add a "minimum independent signal sources" check in `agreement_scoring`: if the run effectively only had one source, mark `flagged=True, flag_reason="single_source_run"` regardless of agreement_coverage.

- **`sahi_recovery` "tiles that fail are recorded but op succeeds".** Recorded *where*? The op output is `FrameDetections`. **Fix:** add a `tile_errors: list[TileError]` field to `FrameDetections` and assert that >50% tile failure rate elevates to a run-level warning.

- **`box_fusion` "deterministic given fixed inputs and tied seeds".** WBF is deterministic *if* you sort inputs deterministically and don't depend on Python dict order. **Fix:** §3.8 must state inputs are sorted by `(detector, frame_id, label, x, y)` before fusion.

- **`classification_refine` "leave vlmStructuredAttributes empty".** Downstream code (mobile UI) must handle `{}` everywhere. The plan never audits the mobile to confirm empty attributes don't break the detail screen rendering. **Fix:** add a Phase 6 task: "audit `item_detail_screen.dart` for null/empty handling on every attribute field".

- **`assemble_result` "always succeeds".** But the plan's invariant is that errors propagate via `errors[]`. What happens if `assemble_result` itself raises (e.g., a Pydantic validation error on the assembled JSON)? §3.15 says "pure transformation, no model calls" — but it can still throw on invalid input. **Fix:** explicitly bound assemble_result with try/except → emit a minimal-valid-but-flagged SceneObservation with the exception text in errors[].

---

## 8. Things missing that I'd expect

- **No threat model for the FastAPI sidecar.** It binds to loopback per the plan, but there's no auth between Fastify and FastAPI. Anyone with shell access can submit runs. For a personal Mac that's fine, but the plan should *say* it's accepted: "FastAPI sidecar trusts loopback; no inter-service auth in v1."

- **No idempotency at the pipeline-service layer.** Fastify uses `sha256(image)` as the Temporal `workflowId` today — that's how duplicate uploads are debounced. The new `POST /runs` returns a fresh `runId` every call. Two retries of the same upload will spawn two pipeline runs. **Fix:** §4.2 should accept `idempotency_key` (= sha256) and dedupe at the sidecar — return the existing runId if one is already running for that key.

- **No mention of Dagster instance storage location/cleanup.** Dagster persists run history in `$DAGSTER_HOME` (default ~/.dagster). On a personal Mac this grows unbounded. **Fix:** specify `DAGSTER_HOME=~/allmythings-data/dagster` and a retention policy (e.g., last 100 runs).

- **No mention of model warm-up at service start.** §1 says "Models loaded once, kept warm." But cold start of DINOv2 + EffSAM + GroundingDINO + Florence client + Ollama can be 20–60 s. The first capture after `make start` will time out. **Fix:** add a `warmup` op or sidecar startup task that does a forward pass on a 1×1 black image at boot.

- **No coverage of the `make start` orchestration ordering.** Pipeline-service must start *after* detection-service (Florence) and Ollama. **Fix:** `start-pipeline.sh` should health-check both before starting.

- **No mention of how the FastAPI sidecar exits/restarts on crash.** Fastify will see a connection refused, return 5xx; mobile will retry. If the sidecar repeatedly crashes (OOM from model loads), there's no circuit breaker. The plan deletes circuit-breaker.ts (§10 Phase 5) without replacement. **Fix:** keep circuit-breaker on the Fastify side as `pipelineHealth` gate.

- **The plan declares `mobile-app/ios/Runner/` "DELETE CoreML-specific code" without identifying which files.** This is a hand-grenade; CoreML code is intermixed with platform-channel boilerplate. **Fix:** §2 must enumerate the specific files/symbols to delete.

- **No security review of mobile face-redaction.** ML Kit face detector runs locally, fine, but the redaction is "blur each face's bbox before encoding" (§9.1). Bounding-box blur is reversible if the original is preserved. **Fix:** §9.1 must say the original-resolution frame is discarded immediately after WebP encoding; only the redacted WebP is kept in memory.

- **No log-redaction policy.** Pino logs in Fastify and structured logs in pipeline-service may include Qwen-VL captions and prompt lists, which *might* contain PII inferred from the photo (e.g., text on documents in frame). Plan should say what's redacted from logs.

- **The eval rig CI gating depends on a corpus that doesn't exist yet.** §7.1 says corpus is "locally captured during execution". §7.3 says CI exits non-zero on threshold violation. So Phase 7 can't run in CI until a corpus exists, and the plan never says when/how it gets seeded. **Fix:** Phase 7 should explicitly include a "capture starter corpus (5×3×2 = 30 scenes)" task gating the CI rollout.

- **No rollback plan for Phase 5.** Once Temporal is deleted, reverting to the Temporal path requires a git revert. **Fix:** state explicitly: "Phase 5 is irreversible without a code revert; gate the deletion on two consecutive eval-rig green runs against the captured corpus."

- **The `ContributingSignal.rawConfidence` field (§5.1).** §3.4 sets Florence's score to 1.0 always. So `rawConfidence` is meaningless for Florence. **Fix:** make `rawConfidence` `Optional[float]` and document that Florence emits None.

---

## Specific bugs / contradictions to fix before implementation

1. **§3.2 vs §5.1 vector dimension** — ViT-S/14 (384-d) vs declared 1024-d. Pick one.
2. **§3.4 vs §3.8 vs §6.1** — Florence's score=1.0 vs "no signal" vs "1 unique signal". Reconcile.
3. **§6.4 Level 2 "halve `crossFrameEmbeddingTheta`"** — would push θ to 0.425, collapsing dedup. Restate as a delta.
4. **§5.3 `inventory_items.sceneId` and `detections.sceneId`** — redundant FK. Pick one parent.
5. **§5.3 `label_search_fts` "extend to alternateLabels"** — Drift FTS5 doesn't index JSON. Denormalize.
6. **§3.13 empty-detection-set math** — `agreement_coverage` undefined when count=0.
7. **§3.3 prompt cache + §3.2 zero-vector failure** — collisions on failed embeddings.
8. **§4.3 `waitForCompletion` polling** — cadence unspecified; will hammer Dagster.
9. **§3.14 sub-run lineage in Dagster** — the implied semantics doesn't exist; pick `DynamicOut`.
10. **Phase 5 deletes Temporal before Phase 6 ships mobile** — type-mismatch regression window.
11. **§3.8 WBF detector weights** — unspecified.
12. **§3.11 label-text-embedding compatibility** — encoder/threshold unspecified.

---

## Final recommendation

**Ship with these fixes.** Concretely, before any code lands, update the plan to address bugs 1–12 above, plus:

- Pin the Dagster execution model (in-process vs daemon) — §3 / §11.6.
- Add an idempotency key contract on `POST /runs` — §4.2.
- Specify warm-up, run coordinator, and concurrent-run cap — §1 / §11.6.
- Reorder Phase 5/6 or add a translation layer in Fastify.
- Specify the rerun "no-improvement" early bail in self_diagnosis — §3.14.
- Define empty-set semantics for every numeric op output — §3.13, §3.10, §3.11.
- Audit the spike-test acceptance criteria with concrete latency + memory numbers — §11.1.
- Add the Phase-4 split into 4a/4b/4c/4d.

The architectural bet (Dagster + Fastify + agreement-as-truth + AI-only labelling) is defensible and well-motivated by the interview. The plan documents tradeoffs honestly. The execution risk is concentrated in the agreement math + self-diagnosis recursion + Apple-Silicon viability — and the plan acknowledges the third while underweighting the first two.
