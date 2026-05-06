# Detection Pipeline Rewrite — Interview Transcript

Date: 2026-04-29
Spec: [2026-04-29-detection-pipeline-structural-rewrite.md](2026-04-29-detection-pipeline-structural-rewrite.md)
Research: [claude-research.md](claude-research.md)

Three rounds of focused architectural / scope questions. Answers below
are verbatim from the user; commentary in italics.

---

## Round 1 — Architecture & deployment

### Q1. What's the compute model the rewrite should target?

**A:** Local Mac only (current).

*Implication: no cloud GPU; no OWLv2 unless it runs on Apple Silicon
(it doesn't, practically); model picks must be ONNX/CoreML/MLX-viable.*

### Q2. What UX latency target should the API contract guarantee?

**A:** Async-first, current contract.

*Keeps the existing 200 (sync if ≤90 s) / 202+poll pattern. Mobile
already handles polling. Frees the pipeline to run multi-pass without
fighting a sync deadline.*

### Q3. Where should the inventory truth live going forward?

**A:** Mobile-only (current Drift).

*Implication: no PostgreSQL/pgvector on the API host. Embeddings,
HITL queue, ground truth, all of it must live in Drift on the device.
Server stays stateless apart from photos on disk and Temporal/Dagster
event history.*

### Q4. What role should on-device CoreML detection play?

**A:** Remove it.

*Removes the CoreML detector + the optimistic-preview fallback in
`detection_providers.dart`. Simpler mental model; the phone always
calls the Mac. No offline support.*

---

## Round 2 — Data, latency, HITL, capture

### Q5. How much labelled household-scene data do you already have?

**A:** "I want labelling to be completely AI-based, nothing should be
hardcoded. I don't want to maintain lists of anything."

*This is the biggest single constraint of the project and reshapes the
plan considerably:*

- *No hand-curated household ontology (Open Images / HomeObjects-3K /
  custom hierarchy → off the table as authoritative class lists).*
- *No fine-tuned classifiers — must work zero-shot.*
- *Open-vocab detector prompts must be generated per-scene by a VLM
  (auto-prompt expansion — confirmed as Q11.b below).*
- *Ground truth for eval cannot come from human labels — must come
  from agreement signals (Q9).*

### Q6. What's the acceptable upper-bound latency for a single capture?

**A:** No hard ceiling — quality > latency.

*Combined with Q2 (async-first), the pipeline can run as many passes
as it wants, including SAHI tiling + multi-frame burst processing +
embedding dedup without time pressure. The user accepts a multi-minute
tail when needed.*

### Q7. How much human-in-the-loop confirmation is acceptable per capture?

**A:** None — must be fully automatic.

*Combined with Q5, this means the system has neither human ground truth
nor a human dispute resolver. Every confidence/dedup/labelling decision
must be made automatically. Self-diagnosis (Q11.a) is the safety net.*

### Q8. Which mobile capture-quality gates are in scope for the v1 rewrite?

**A:** All four — blur + exposure pre-check, face/PII redaction,
multi-frame burst + best-frame pick, compression + resize to 1280 px WebP.

*Big mobile-side scope. The capture screen + provider is essentially
rewritten. Multi-frame burst doesn't need to feed the server multiple
frames — pick best frame on device, send one — but the design should
allow multi-frame upload later if it improves recall.*

---

## Round 3 — Eval, privacy, models, cleanup

### Q9. What should drive evaluation when there's no human-labelled ground truth?

**A:** Multi-model + multi-frame agreement only.

*No VLM-as-judge. No external LLM in the eval loop. The "ground truth"
for a detection is "≥N independent passes/models agree". This pushes the
plan to:*

- *Run the pipeline multiple times on captured frames (or on multiple
  frames from the burst).*
- *Run multiple detectors (DINO + Florence-2 + Qwen-VL re-prompted as
  detector) and require agreement.*
- *Compute "agreement-coverage" and "agreement-precision" as the CI
  metrics in place of mAP/recall@IoU.*
- *Expose disagreement cases as `unverified` in the inventory so the
  user can see them but the system isn't claiming truth.*

### Q10. Where can the captured photo go, in your privacy model?

**A:** Phone → local Mac only.

*Confirms Q1. No cloud egress. Eval runs locally only — even the
agreement-judge passes must run on the Mac.*

### Q11. What's the appetite for installing bigger / additional models on the Mac?

**A:** Add open-vocab detector + segmenter (~3–6 GB).

*Plan can assume Grounding DINO 1.5 Edge (or comparable Apple-Silicon-
viable open-vocab detector), EfficientSAM-Ti, and DINOv2-Base/Small are
all installable. NOT upgrading Qwen-VL — keep current 7b/3b/Moondream
tier set. Plan section on model installation must verify Apple-Silicon
viability for each (likely via ONNX Runtime + CoreML EP, or via MLX
ports where they exist).*

### Q12. How aggressive should the rewrite be on legacy / dead code?

**A:** "Look into Airflow which is more Python native, but I need a
solid orchestration and observability fully baked in with UI and log
ingestion and self-diagnosis."

*Major pivot — user is open to replacing Temporal entirely with a
Python-native orchestrator. Followed up in Round 4 (below).*

---

## Round 4 — Orchestrator pivot, service split, extras

### Q13. On orchestrator: Airflow vs Prefect vs Dagster vs Python Temporal?

**A:** Dagster.

*Locked in. Dagster's asset/lineage-centric UI matches "self-diagnosis"
better than Airflow's task-log UI. Implications for the plan:*

- *Replace `api-service/src/temporal/` (workflow + activities + worker
  + client + replay tests) with a new Python service running Dagster.*
- *Keep the LGTM observability stack — Dagster runs alongside it.*
- *Dagster's assets model fits "detection on photo X produces
  detections, embeddings, agreement signals" cleanly.*
- *Replay-test discipline (currently from `record-happy-path.ts` +
  Temporal replay) needs a Dagster-native equivalent: snapshot+replay
  via deterministic op fixtures, or treat as integration tests.*

### Q14. How do we split Fastify TS vs the new Python orchestrator?

**A:** Keep Fastify HTTP layer; move pipeline to Python.

*Final architecture:*

```
Mobile (Flutter)
  └── HTTPS → Fastify (TS, api-service/)
                ├─ /v1/detect  (multipart, auth, photo persist, queue job)
                ├─ /v1/detect/status/:runId  (poll Dagster run state)
                └─ /photos/*, /metrics, /health
                    │
                    ▼  (job queue / RPC — see plan)
              Dagster (Python, new service)
                └─ assets/ops:
                    ├─ multi-frame intake
                    ├─ scene embedding (DINOv2)
                    ├─ VLM prompt expansion (Qwen-VL "what should
                    │   we look for here?" → prompt list)
                    ├─ open-vocab detection (Grounding DINO)
                    ├─ SAHI tiling on low-coverage regions
                    ├─ promptable segmentation (EfficientSAM)
                    ├─ box fusion (WBF)
                    ├─ classification refinement (Qwen-VL tiers)
                    ├─ embedding extraction per crop (DINOv2)
                    ├─ cross-pass / cross-frame dedup (FAISS in-process)
                    ├─ agreement scoring (multi-model agreement)
                    ├─ self-diagnosis (low-coverage trigger → rerun)
                    └─ result assembly
```

### Q15. Anything else specific to bake into the plan?

**A:** All four selected:

1. **Self-diagnosis hook** — pipeline auto-flags low-quality runs and
   reroutes to a stricter rerun (more passes, finer SAHI, more frames).
2. **Auto-prompt expansion via VLM** — no static prompt list; a VLM
   inspects the scene and proposes the open-vocab class set.
3. **Scene/room embedding for context** — whole-image embedding feeds
   downstream confidence priors and helps dedup ("same scene → same
   coffee table").
4. **Aggressive cleanup** — delete legacy `providers/`, dead
   `schemas/detection.schema.ts`, unused `circuit-breaker.ts`,
   duplicate types, all of it.

---

## Synthesis — what the plan must commit to

1. **Stack:** Florence-2 (kept) + Grounding DINO 1.5 Edge (new,
   ONNX/CoreML on Apple Silicon) + EfficientSAM-Ti (new) + DINOv2
   embeddings (new) + Qwen2.5-VL 7b/3b/Moondream (kept).
2. **Orchestrator:** Dagster (new Python service); delete Temporal
   workflow/activities/worker/client + their tests.
3. **HTTP layer:** Fastify TS keeps auth, multipart, photo storage,
   202+poll contract. Job dispatch to Dagster via REST/gRPC/queue.
4. **No human labels, no human-in-the-loop, no cloud, no static
   taxonomy, no latency ceiling.**
5. **Confidence = multi-model + multi-frame agreement.**
6. **Self-diagnosis** triggers stricter reruns when agreement-coverage
   drops below threshold.
7. **VLM-driven prompt expansion** replaces every hand-curated class
   list — Qwen-VL or similar generates per-scene prompts dynamically.
8. **Scene-level embedding** flows into downstream confidence priors
   and cross-frame dedup.
9. **Mobile capture v1:** blur + exposure pre-check, face/PII
   redaction, multi-frame burst with best-frame pick, WebP @1280 px
   compression. Drop CoreML on-device detection.
10. **Drift schema rewrite (no migration plan)** to add detections,
    embeddings, agreement scores, scene context. Per stored memory:
    app not deployed → rewrite directly.
11. **Aggressive cleanup**: delete `api-service/src/providers/*`,
    `api-service/src/schemas/detection.schema.ts`,
    `api-service/src/utils/circuit-breaker.ts` (or wire it before
    deletion if used by Dagster ops),
    `api-service/src/services/image-quality.service.ts` (or wire it),
    and Temporal-specific files once Dagster is live.
12. **CI gates** measure: agreement-coverage, agreement-precision,
    multi-frame stability, self-diagnosis trigger rate, latency p50/p95
    (informational, not gating).
