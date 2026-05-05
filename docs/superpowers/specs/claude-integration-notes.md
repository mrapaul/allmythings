# Integration Notes — Opus Review Iteration 1

This file documents which review suggestions are integrated into the plan
and which are deliberately not, with rationale. The reviewer is the
authority on technical accuracy; the plan author is the authority on
scope and trade-offs.

## P0 — Integrated (correctness blockers)

### P0.1 — `category_id=-1` mAP claim was wrong
**Action:** Rewrote §4.5 to specify two distinct mAP passes:
- **Class-aware mAP**: only label-matched detections enter pycocotools, with the matched GT cat id; unmatched detections are excluded.
- **Class-agnostic mAP**: all detections (and all GT) collapsed to a single synthetic category id; pycocotools scores box-quality independent of label.
Both numbers ship in the headline. Class-aware is the joint metric; class-agnostic is the box-quality metric. Standard open-vocab reporting practice.

### P0.2 — `single_image_pipeline_runner` shim spec
**Action:** Added explicit specification of a `single_image_pipeline_runner(image_path: Path) -> SceneObservation` shim in §4.11 that wraps a single image into a synthetic `CorpusItem(scene_id=f"lvis-{image_id}", capture_id="0", frame_paths=[image_path])` and calls `pipeline_job.execute_in_process` with a one-frame run config.

### P0.3 — Async/sync orchestration contradicts itself
**Action:** Made `run_gt_eval` synchronous in §4.11. The judge's `verify` is awaited via `asyncio.run` inside the hallucination-detection batch call, the only place async actually matters (Ollama). Updated §4.12 to remove the "existing event loop" claim.

### P0.4 — `EVAL_FAST_MODE` skip-SAHI requires modifying existing code
**Action:** Renamed to `EVAL_SKIP_SAHI=1` (separate from `CLASSIFICATION_TOP_K`, which is already env-driven). Acknowledged in §10 (Rollout) that this is a small targeted edit to `pipeline_service/dagster_defs.py` (or `sahi_recovery_op`) — not purely additive. Added a unit test asserting SAHI is a no-op under the env var. The change is gated to env var only, no behaviour change in the default path.

## P1 — Integrated (gate meaningfulness)

### P1.5 — Partial judge failure → hallucination rate honesty
**Action:** §4.7 updated. If `(judge_unsure + judge_failures) / candidates > 0.5`, `hallucination_rate` is reported as `null` and the gate is skipped. Below that ratio, `rate = verified_hallucinations / total_predictions` (the conservative interpretation: judge_unsure does not become a hallucination automatically).

### P1.6 — Confidence source for pycocotools
**Action:** §4.5 specifies `pycocotools` reads `PipelineDetection.confidence`; if 0, fall back to `PipelineDetection.agreementScore`. Documented in the function docstring.

### P1.7 — Rounding for MPS non-determinism
**Action:** §5.4 added: all `gt_metrics` values rounded to 3 decimal places before comparison or persistence.

### P1.8 — LVIS dataset version pinning + sha256
**Action:** §4.2 LvisConfig gains `expected_sha256: str | None`. The downloader verifies the archive sha256 on download; mismatch aborts. The baseline file stamps `lvis_dataset_sha256`. Baselines from a different LVIS version cannot be compared (forces re-bootstrap with explicit env opt-in `EVAL_LVIS_VERSION_BUMP=1`).

### P1.9 — Python version determinism for sampling
**Action:** §4.2 specifies `numpy.random.default_rng(seed).choice(image_ids, size=N, replace=False)` (stable across Python versions). Eliminates the `random.Random.sample` 3.11 algorithm change risk.

## P2 — Integrated (robustness)

- **P2.10** `LabelMatcher` Protocol in §4.3.
- **P2.11** Calibration sentinels expanded to 50 pairs across 4 buckets in §6.1.
- **P2.12** Box clamping + zero-area filtering in §4.4 with explicit unit tests.
- **P2.13** Bootstrap must satisfy `floor_violations==0` in §4.10.
- **P2.14** `label_encoder_model_id` stamped in baseline; mismatched id forces re-bootstrap. §4.10.
- **P2.15** `LICENSE-LVIS.md` written to cache dir on first download. §4.2.
- **P2.16** Real-pipeline opt-in integration test gated on `EVAL_TEST_REAL_PIPELINE=1`. §6.2.
- **P2.17** `EVAL_BASELINE_AUTOCOMMIT=false` is the v1 default. Bake-in policy: flip to `true` once we have 5+ stable runs. Documented in §10 and §5.1.
- **P2.18** `lvis_aliases.json` override map. §4.3 and §4.2.
- **P2.19** Class-agnostic mAP shipped in v1 alongside class-aware mAP. §4.5 (already addressed by P0.1).
- **P2.20** Preflight model-warmup step calling detection-service `/health` and one warm-up forward pass. §4.11.

## Smaller items also integrated

- §3.2: Added `EVAL_RUN_AGREEMENT=false` toggle for symmetry with `EVAL_RUN_GT`.
- §4.2: Pinned LVIS download URL.
- §4.5: Documented pycocotools availability detection (try-import at module load).
- §4.7: `HALLUCINATION_JUDGE_MAX_CALLS` default reconciled to `max(50, int(0.1 * total_predictions))` (dynamic, scales with corpus).
- §4.9: Qwen-VL prompt updated to demand `{"verdict": "yes|no|unsure"}` JSON shape.
- §5.1: Documented that `EVAL_IOU_THRESHOLD` covers both F1 matching and hallucination-detection IoU; mAP uses pycocotools' full sweep.
- §7.2: Recomputed runtime budget. SAHI bypass + top-K reduction is ~2.5× speedup, not 10×. Updated to first-run ≤120 min, subsequent runs ≤90 min, smoke run ≤25 min.
- §7.4: Verified there is no existing `eval-pipeline` Makefile target at the repo root (research §1.1 was wrong about that). Adding `test-eval` and `test-eval-smoke` only.
- §10 step 3: Specified the exact `.gitignore` line: `pipeline-service/eval/datasets/`.

## Not integrated (with rationale)

### Top-10 / bottom-10 per-class breakdown — kept in v1, NOT deferred
**Rationale:** Interview Q16 explicitly chose this format. The marginal complexity (sorting a list and slicing) is trivial. Deferring would override an explicit user decision without a strong reason.

### Auto-commit baseline policy — partially deferred
**Rationale:** Interview Q14 chose auto-commit. Reviewer's pushback is sound for the first month; integrating that as the v1 default but documenting the eventual flip-to-true target. This is a balance between user choice and review concern.

### Calibration sentinels — bumped from 50 to 60 across 5 buckets
**Rationale:** Reviewer asked for 50 across 4 buckets. The 5th bucket (cross-language synonyms — "tv" vs "telly") is small but useful for the user's mixed-language detection ("la table"). Cheap to add.

### Skip the existing `make eval-pipeline` claim from research
**Rationale:** Reviewer is correct: there is no `eval-pipeline` target in the root Makefile. The research doc claimed it exists; that was wrong. Plan now adds only `test-eval` and `test-eval-smoke`. The existing in-tree `make eval-ci` if it exists in a different file is left alone.

## Summary

The plan was generally sound architecturally but had concrete contract gaps that would have produced wrong numbers (P0.1 — pycocotools category_id=-1) or hidden coupling (P0.2 — single_image_pipeline_runner). All P0 and P1 items are integrated. Most P2 items are integrated. Only one user-facing scope decision (top-10/bottom-10) is kept against reviewer recommendation, on user-decision-precedence grounds. Auto-commit policy is split: keep the design, default to off for v1.
