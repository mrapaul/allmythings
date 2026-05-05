# Interview — Automated Detection Evaluation

Captured before drafting the implementation plan. Q1–Q18 cover scope,
data sources, integration, gating, and drift-guard policy.

---

## Round 1 — Research Decisions

### Q1. Should I research the existing eval rig and codebase structure first?
**A:** Yes, research the codebase.

### Q2. Which best-practice topics should I research?
**A:** All four — Object detection eval metrics 2026; Indoor scene
annotation datasets; VLM-as-judge for detection; Open-vocabulary
detection benchmarks.

---

## Round 2 — Scope and Sources

### Q3. What's the primary "expected results" source you want the harness to grade against?
**A:** External dataset (LVIS/OpenImages).

### Q4. Which reference VLMs should the harness use for cross-model corroboration?
**A:** Local Qwen-VL via Ollama (only). No cloud VLMs.

### Q5. Where should the eval run automatically?
**A:** Local only via `make` target. No GitHub Actions integration in v1.

### Q6. What's the per-run cost cap for cloud VLM judges?
**A:** Free local-only by default. Cloud judges out of scope for v1.

---

## Round 3 — Concrete Choices

### Q7. Which external dataset should we start with?
**A:** LVIS-OV rare-class subset.

### Q8. How do we match open-vocab labels (`marble coffee table`) against fixed-taxonomy GT (`coffee_table`)?
**A:** Embedding similarity ≥ threshold via the existing
`sentence-transformers/all-MiniLM-L6-v2` label encoder.

### Q9. When the eval finds regression vs the committed baseline, what should it do?
**A:** Fail with non-zero exit + diff report. `make test-eval` returns 1
and prints which metrics regressed by how much.

### Q10. Where should the dataset cache live?
**A:** `pipeline-service/eval/datasets/` (gitignored).

---

## Round 4 — Operational Parameters

### Q11. How many LVIS-OV images should the eval run on?
**A:** 500 images (standard) — ~30–45 min runtime, reasonable
statistical confidence on rare-class AP.

### Q12. How should the eval invoke the detection pipeline?
**A:** In-process Dagster (existing pattern via
`pipeline_job.execute_in_process()`).

### Q13. Filter LVIS-OV to indoor scenes for our household-inventory app?
**A:** Indoor / household categories only — reflects the app's actual
workload.

### Q14. How should the baseline file be managed?
**A:** Auto-commit on every passing run (with absolute-floor protection
— see Q18).

---

## Round 5 — Quality Gates

### Q15. Which metrics should be hard gates (CI fails) vs warn-only (logged)?
**A:** All three are hard gates:
- mAP@0.5:0.95 floor (e.g. ≥ 0.20)
- Hallucination rate ceiling (e.g. ≤ 0.15)
- Label F1 floor (e.g. ≥ 0.50)

The existing agreement-coverage / op-failure thresholds also stay as
gates (they were already passing CI).

### Q16. Per-LVIS-category AP breakdown, or just headline numbers?
**A:** Both — headline aggregate metrics PLUS top-10 / bottom-10
categories sorted by AP. Surfaces both wins and worst-case failure
modes without exhaustively dumping every class.

### Q17. Where do new metrics live in `last-metrics.json`?
**A:** New `gt_metrics` block alongside the existing `metrics` block.
Existing agreement metrics carry forward unchanged so current consumers
don't break.

### Q18. How do we catch slow drift if baseline auto-commits on every passing run?
**A:** Absolute-floor thresholds in `eval/thresholds.json` IN ADDITION
to baseline-diff comparison. Auto-commit cannot push the baseline below
the absolute floor; the floor lives in the gating bucket.
