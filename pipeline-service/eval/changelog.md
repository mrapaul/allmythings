# Eval changelog

Append to this log after every Phase-4 sub-phase or threshold tune.
Each entry records:
  - Date
  - What changed
  - Metric impact (`agreement_coverage_avg` before/after, etc.)
  - Whether `make eval-pipeline` was green

## Format

```
## YYYY-MM-DD — <short title>
- Section: <section-04 / section-05 / etc.>
- Change: <one-line summary>
- Metrics:
    agreement_coverage_avg:    0.71 -> 0.78
    agreement_precision_avg:   0.42 -> 0.48
    self_diagnosis_trigger:    0.18 -> 0.12
- Gate: green
```

## Initial entry

## 2026-04-30 — section-09 ships the eval rig
- Section: section-09
- Change: Initial eval rig + metrics + thresholds + Make target.
- Metrics: corpus empty (informational mode); no measurements yet.
- Gate: informational (no corpus captured).

Capture protocol (5 rooms × 3 angles × 2 captures = 30 scenes) is the
operator's first task before activating gating; see section-09's
"Starter-corpus capture protocol" in the plan.
