# Automated Detection Evaluation — Spec

## Goal
Replace manual iPhone-photo testing of the visual-home-inventory detection
pipeline with an automated evaluation harness that runs against curated
datasets and corroborates results with independent vision models.

## Why
Manual testing is slow, non-deterministic, and gives binary "looks
right/wrong" feedback that's hard to regress against. We need:
- Reproducible runs against a fixed image corpus
- Quantitative metrics (precision, recall, IoU, label F1) per pipeline change
- Cross-model agreement scoring to flag detections that need human review
- CI integration so a PR that lowers detection quality fails before merge

## Scope
1. **Curated test corpus** — household-scene images with ground-truth labels
   (custom-annotated subset of an existing dataset like ADE20K-indoor /
   COCO-indoor / OpenImages furniture, plus a small bespoke set drawn from
   `test_images/`).
2. **Reference-model corroboration** — run each test image through ≥1
   independent zero-shot detector (e.g. OpenAI GPT-4o vision, Anthropic
   Claude vision, Google Gemini vision, OWL-ViT, YOLOv8) and compare its
   labels/boxes against our pipeline output.
3. **Metric pipeline** — compute IoU-matched precision/recall against
   ground-truth, plus label-set F1 against reference-model consensus, plus
   a hallucination rate (detections with no spatial corroboration in any
   reference model).
4. **Test runner integrated with `pipeline-service/eval/`** (the rig
   already exists at `pipeline-service/pipeline_service/eval/`), expanded
   to support the new corpus + reference-model adapters + metric output.
5. **Threshold gates** — fail the suite if recall drops below X or
   hallucination rate climbs above Y compared to a committed baseline.
6. **CI hookup** — runnable via `make test-eval` and via a GitHub Actions
   nightly job; baseline metrics committed to the repo.

## Out of scope
- iOS-side UI testing (covered separately).
- Re-training the underlying models.
- Active-learning loop / human relabel UI.

## Constraints
- Must work entirely from this Mac for local dev (no cloud required for
  base run); cloud reference-models are opt-in via API keys.
- Must not regress existing 235+ unit tests.
- Reference-model API costs need a cap (configurable).
- No hardcoded prompt or item lists anywhere (continuing the recent
  cleanup).

## Success criteria
- A single command runs the eval, prints a metrics report, and exits
  non-zero on regression.
- A new test image + ground truth can be added via a documented
  contribution flow without touching code.
- Three or more reference models can be plugged in via a stable adapter
  interface.
