# Detection & Classification Pipeline — Structural Rewrite (Spec)

Date: 2026-04-29
Status: SPEC (seed for /deep-plan)
Owner: TBD via interview

## Problem Statement

The current Visual Home Inventory detection/classification pipeline is **not
working as a product**. Despite multiple prior plans (multi-pass, three-tier,
Temporal orchestration, etc.), the system still:

1. **Fails to detect ALL home objects** in real captured scenes — small,
   occluded, low-contrast, and partially-visible items are systematically
   missed.
2. **Fails to classify correctly** — coarse provider labels (Google Vision,
   AWS Rekognition) collapse household items into useless generics or wrong
   categories, producing an inventory the user cannot trust.
3. **Has structural gaps** in three layers:
   - **Observation** — what we look at (single frame, single resolution,
     no segmentation, no scene/room context, no embedding-based dedup).
   - **Orchestration** — how we coordinate passes/providers (sequential,
     no specialised models, partial failures degrade silently).
   - **Logic / fusion** — how we merge, score, and resolve detections
     (uncalibrated confidence, no aliasing/duplicate resolution, no
     household-aware ontology).

The brief is **not** to patch the existing implementation. Treat it as a
**structural rewrite**: keep what is genuinely load-bearing (capture,
storage, mobile UX shell, Temporal scaffolding if useful) and replace the
detection-orchestration-fusion-classification core with something we can
**measure** and **defend**.

## Non-Negotiable Goals

A successful rewrite ships with all of these, measurable on a held-out
labelled scene set:

- **Recall:** detects ≥ 95% of physically inventoryable objects in a
  representative household scene (target tunable per scene class — kitchen,
  closet, garage, living room — but no scene class below 90%).
- **Classification accuracy:** top-1 fine-grained class correct ≥ 85% on
  detected objects, with calibrated confidence (Brier / ECE reported).
- **Duplicate / aliasing rate:** < 5% of detections are duplicates or
  aliases of another detection in the same capture.
- **Reliability:** end-to-end success rate ≥ 99% under provider partial
  failure (we degrade, we don't fail silently, low-confidence items get
  routed to human-in-the-loop instead of dropped or fabricated).
- **Reproducibility:** every detection output is traceable — which models
  saw what, at what confidence, which fusion rule won. No silent magic.

## Scope (What the Plan Must Cover)

The /deep-plan workflow should produce a sectionised, TDD-oriented plan
covering at minimum:

1. **Multi-pass detection strategy** — multi-resolution, multi-crop,
   multi-frame; explicit handling of small / occluded / clutter cases.
   Decision: when does multi-pass stop?
2. **Provider orchestration** — beyond Google Vision + AWS Rekognition.
   Add (or replace with) **specialised** models: open-vocabulary
   detectors (e.g. Grounding DINO / OWLv2 family), promptable segmenters
   (SAM-class), scene/room classifiers, fine-grained product/embedding
   models, OCR for labels/serials. Plan must define the role of each and
   the cost/latency budget per pass.
3. **Ensemble fusion** — calibrated confidence, NMS / IoU-aware merging,
   embedding-based duplicate / aliasing resolution, conflict resolution
   between coarse provider labels and fine-grained model outputs.
4. **Classification taxonomy** — a household inventory ontology
   (categories, attributes, materials, brands where useful) and the
   mapping from raw model outputs to it. Includes "unknown" as a
   first-class outcome, not a silent skip.
5. **Failure modes & resilience** — provider outages, partial results,
   timeouts, low-confidence routing, human-in-the-loop verification queue,
   and the contract between the API service and mobile UX for partial /
   pending state.
6. **Evaluation harness** — a labelled scene set (own + augmented),
   recall / precision / coverage / calibration metrics, regression gates
   in CI, and the definition of "shippable accuracy" per scene class.
   This is the tool that **proves** accuracy, reliability, resilience.
7. **Mobile-side implications** — capture quality (focus/exposure/blur
   gating), multi-frame burst, on-device pre-filter / heuristics, and
   how the user sees pending vs. confirmed inventory items.
8. **Data / storage model changes** — what the existing schema is missing
   to record per-detection model provenance, embeddings (for dedup and
   future similarity search), human-verification state, and evaluation
   ground-truth links. (Per project rule: not deployed, so schemas can be
   rewritten directly — no migration overhead.)

## Constraints / Context

- **Repo:** `/Users/mrarindampaul/Develop/allmythings`
  - Mobile: Flutter `mobile-app/` (Riverpod, Drift, Freezed, GoRouter).
  - API: Node/Fastify `api-service/` with adapters in
    `api-service/src/adapters/` and orchestration in
    `api-service/src/services/` (existing `VisionOrchestratorService`,
    `EnsembleFusionService`).
- **Prior plans** in `docs/superpowers/plans/` should be read for context
  but are NOT binding. Several are partially executed; the new plan must
  state explicitly **what to keep, what to replace, what to delete.**
- **No deployment yet** → free to rewrite database schemas in place; no
  migration plan needed (per stored user feedback memory).
- **TDD-oriented** — every section in the final plan must specify failing
  tests first, then implementation, per the deep-plan TDD pass.

## Out of Scope (Explicit)

- Identity / auth, billing, multi-tenant isolation — leave the existing
  shell in place.
- Native iOS / Android specific code beyond what Flutter exposes.
- Non-vision modalities (audio, NFC, barcode-only flows) — may be future
  work but not part of this rewrite.

## Success Criteria for the Plan Itself

The plan that comes out of /deep-plan is good if a competent engineer who
has never seen this repo can:

1. Read it end-to-end and explain the new architecture in one paragraph.
2. Run the evaluation harness on day 1 of execution and see real numbers.
3. Pick up any section, see the failing test stubs, and start implementing.
4. Tell me, for any specific existing file in `api-service/src/services/`
   or `api-service/src/adapters/`, whether to **keep, replace, or delete**.
