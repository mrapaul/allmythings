I have all the context I need now. Let me write the section content.

<!-- BEGIN SECTION CONTENT -->

# section-07-agreement-and-diagnosis

**Phase:** 4d (gating math)
**Depends on:** section-06-fusion (provides the fused, deduped `SceneObservation` with `contributing_signals` populated)
**Blocks:** section-09-eval-rig (consumes the agreement metrics and the diagnosis flag set)
**Test command:** `cd pipeline-service && uv run pytest tests/unit/ops/test_agreement_scoring.py tests/unit/ops/test_self_diagnosis.py tests/unit/test_agreement_math.py tests/integration/test_self_diagnosis_dag.py`

---

## 1. Problem statement (self-contained)

This section implements the **gating math** that turns a deduped multi-frame
detection set into a calibrated `SceneObservation` and decides whether to
trigger a stricter rerun. It is the heart of "no human ground truth, no
human-in-the-loop": if the math is wrong, the whole architecture collapses
into noise.

Two Dagster ops are produced:

1. `agreement_scoring` — pure transformation that adds per-detection
   `agreement_score` and `confidence`, scene-level `agreement_coverage` and
   `agreement_precision`, and (when warranted) a `flagged=True` plus
   `flag_reason`.
2. `self_diagnosis` — a Dagster `DynamicOut` op that yields **either** a
   terminal `SceneObservation` (no rerun needed or budget exhausted) **or**
   a `RerunDirective` that fans out a rerun branch in the same DAG.

Both ops are pure-ish (no I/O, no model calls). All model output is already
encoded into `contributing_signals` upstream. This section MUST NOT
introduce model calls — they belong in sections 03/04/05.

**Three regressions this section explicitly guards:**

- The "Florence and gdino are different signal classes" bug (iteration-1-opus
  §2a). They are **the same class** — both first-pass open-vocab detectors
  with overlapping training data. Treating them as independent inflates
  `agreement_score` and makes the confidence sigmoid lie.
- The "halve threshold" bug in the Level-2 strictness ladder (§6.4 of the
  plan). The Level-2 cross-frame embedding threshold update is an **additive**
  delta `θ_new = max(θ - 0.05, 0.7)`, NOT `θ / 2`.
- The "NaN coverage on empty detection set" bug. Coverage and precision over
  an empty detection list are **`0.0`**, never `NaN`, never `1.0`.

---

## 2. Files to create

```
pipeline-service/pipeline_service/ops/agreement_scoring.py    # NEW
pipeline-service/pipeline_service/ops/self_diagnosis.py       # NEW
pipeline-service/pipeline_service/ops/_agreement_math.py      # NEW (pure helpers,
                                                              # importable by both
                                                              # ops AND test_agreement_math.py)

pipeline-service/tests/unit/ops/test_agreement_scoring.py     # NEW
pipeline-service/tests/unit/ops/test_self_diagnosis.py        # NEW
pipeline-service/tests/unit/test_agreement_math.py            # NEW (pure-fn tests)
pipeline-service/tests/integration/test_self_diagnosis_dag.py # NEW (Dagster DynamicOut)
```

## 3. Files to modify

```
pipeline-service/pipeline_service/dagster_defs.py
  - Replace the pass-through stub for agreement_scoring (added in section-01)
    with the real op.
  - Replace the pass-through stub for self_diagnosis with the real op.
  - Wire the DynamicOut fan-out: self_diagnosis -> rerun_branch -> assemble_result.
    The rerun_branch op itself is implemented in section-06 / section-04 (it
    re-runs gdino_detect / sahi_recovery / classification_refine with overrides).
    THIS SECTION ONLY produces the directive that drives the fan-out.
  - Re-feed rerun output into agreement_scoring -> self_diagnosis(depth+1)
    so the recursion is materialised in the same DAG.

pipeline-service/pipeline_service/types.py
  - Add (or finalise) RerunDirective(next_depth, strictness_level, overrides)
    if not already present from section-01 stubs.

pipeline-service/pipeline_service/config.py
  - Confirm thresholds exist with these defaults (set in section-01;
    this section CONSUMES them, does not redefine):
      tau_cov  = 0.70   # agreementCoverageMin
      tau_prec = 0.40   # agreementPrecisionMin
      MAX_RERUNS = 2
      K_baseline = 2
      sigma = 1
```

No changes to `api-service/` or `mobile-app/` in this section.

---

## 4. Tests FIRST (write these before any production code)

### 4.1 `pipeline-service/tests/unit/test_agreement_math.py`

Pure-function tests. No Dagster, no fixtures beyond inline `RawDetection` /
`ContributingSignal` lists.

```python
# Test: signal_class_of('florence')   == 'first_pass'
# Test: signal_class_of('gdino')      == 'first_pass'   (REGRESSION — same class as Florence)
# Test: signal_class_of('gdino-sahi') == 'tiled'
# Test: signal_class_of frame contributor with frame_id 'abc' == 'frame:abc'

# Test: confidence formula matches the table in §6.2 across all integer scores 0..5:
#         score=0 -> ~0.12   (sigmoid(-2))
#         score=1 -> 0.27 +/- eps
#         score=2 -> 0.50 +/- eps
#         score=3 -> 0.73 +/- eps
#         score=4 -> 0.88 +/- eps
#         score=5 -> 0.95 +/- eps
#       (eps = 1e-2; formula is clip01(sigmoid((score - K_baseline)/sigma)))

# Test: agreement_coverage on detection list with mixed scores returns mean(1{score>=2})
# Test: agreement_precision on same list returns mean(1{score>=3})
# Test: empty detection list -> coverage=0.0, precision=0.0 (NOT NaN, NOT 1.0)

# Test (rerun ladder, Level 2 cross-frame embedding theta):
#   theta_new = max(theta_in - 0.05, 0.7) for theta_in in {0.85, 0.80, 0.75, 0.72}
#     -> {0.80, 0.75, 0.70, 0.70}
#   This is the REGRESSION test for the halve-bug. Assert that for theta_in=0.80
#   the result is 0.75 and NOT 0.40.
#
# Test: gdino_score_thr lowering at Level 1:
#   thr_new = max(thr_in - 0.10, thr_in * 0.70, 0.05)
#   - thr_in=0.30 -> 0.21 (multiplicative path wins because subtract gives 0.20 but 0.30*0.70=0.21)
#   - thr_in=0.05 -> 0.05 (floor)
#   The exact rule comes from §6.4: "Lower gdino_score_thr by min(0.10, current * 0.30)";
#   the helper computes thr - min(0.10, thr*0.30) and floors at 0.05.
```

### 4.2 `pipeline-service/tests/unit/ops/test_agreement_scoring.py`

Run the op as a plain Python callable (using Dagster's `build_op_context`) over
hand-built `SceneObservation` inputs.

```python
# Test: Florence + gdino on the same frame F1 ->
#       signal_classes = {"first_pass", "frame:F1"}; agreement_score = 2
#       (REGRESSION for iteration-1-opus.md §2a — Florence and gdino share class)
# Test: Florence + gdino + gdino-sahi on F1 -> {"first_pass", "tiled", "frame:F1"} = 3
# Test: same detection corroborated across F1, F2, F3 with first_pass on each ->
#       {"first_pass", "frame:F1", "frame:F2", "frame:F3"} = 4
# Test: confidence is sigmoid-calibrated from agreement_score, matching the
#       §6.2 table within 1e-2

# Test: empty detection set -> coverage=0.0, precision=0.0 (NOT NaN)
# Test: empty detection set + non-blank scene_embedding (norm > eps) ->
#       flagged=True, flag_reason="empty_detection_set"
# Test: empty detection set + blank scene_embedding (norm < eps) ->
#       flagged=False (a black/blank frame producing no detections is not a failure)

# Test: every detection has signal_classes == {"first_pass"} AND only Florence
#       contributed (gdino + sahi failed, only one frame usable) ->
#       flagged=True, flag_reason="single_source_run"
# Test: rerunDepth field on input is propagated unchanged to output
# Test: the op does NOT mutate its input SceneObservation (returns a new object)
# Test: output ordering is deterministic — detections are sorted by stable key
#       (detection_id) before scoring
```

### 4.3 `pipeline-service/tests/unit/ops/test_self_diagnosis.py`

```python
# Test: agreement_coverage above tau_cov AND precision above tau_prec ->
#       terminal: yields exactly one Out(SceneObservation), no DynamicOut elements
# Test: coverage below tau_cov -> yields DynamicOut(RerunDirective(strictness_level=1))
# Test: precision below tau_prec -> yields DynamicOut(RerunDirective(strictness_level=1))
# Test: flag_reason "empty_detection_set" -> yields DynamicOut(level=1)
# Test: flag_reason "single_source_run" -> yields DynamicOut(level=1)

# Test: input rerunDepth==1 with still-low coverage -> yields RerunDirective(level=2)
#       (strictness_level == rerunDepth + 1)
# Test: input rerunDepth==MAX_RERUNS (default 2) -> terminal,
#       output.flag_reason="diagnosis_budget_exhausted", flagged=True

# Test: no-improvement bail-out — pass an input where the previous rerun's
#       coverage is recorded (e.g., on SceneObservation as a debug field or
#       through op-context) and current coverage is <= previous. Op terminates
#       and emits the PREVIOUS rerun's result, not the current one. The
#       contract for "previous rerun's result" is documented in the docstring;
#       implementer chooses how to thread it (run-config / op tag / a small
#       history field on RerunDirective). Document the choice in the docstring.

# Test: Level 2 directive's overrides include
#       crossFrameEmbeddingTheta = max(current - 0.05, 0.7) (NOT halved)
#       (REGRESSION for the §6.4 halve-bug)

# Test: DynamicOut shape is asserted — when a rerun is needed, the op emits
#       exactly ONE DynamicOut element with a stable mapping_key derived from
#       the rerun depth (e.g., f"rerun_{next_depth}"). Dagster materialises one
#       branch per yielded element.
```

### 4.4 `pipeline-service/tests/integration/test_self_diagnosis_dag.py`

```python
# Test: full DAG runs with simulated low-coverage scene -> DynamicOut spawns
#       rerun_branch in the SAME DAG (no sub-run). Assert via
#       dagster.DagsterInstance event log that the rerun_branch and the
#       second-pass agreement_scoring step both materialised under the same run_id.
# Test: lineage visible via Dagster's run-storage API — the timeline endpoint
#       (GET /runs/:id/timeline from section-01) reports
#       dynamic_outputs >= 1 on the self_diagnosis step.
# Test: terminal happy path runs the DAG without spawning any rerun — assert
#       dynamic_outputs == 0 on self_diagnosis.
# Test: rerunDepth increments correctly across the fan-out — the second
#       agreement_scoring sees rerunDepth=1, the third sees 2.
# Test: at MAX_RERUNS the DAG completes without spawning further fan-out and
#       the final SceneObservation has flag_reason="diagnosis_budget_exhausted".
```

The integration test uses **mocked downstream ops** — the rerun_branch op
is replaced with a fake that returns a controllable second-pass
`SceneObservation` so this section's tests do not depend on sections 03/04/05
producing real detector output. Rely on `pipeline-service/tests/conftest.py`
fixtures for the fake-model HTTP responders (already established in section-01).

---

## 5. Implementation contracts

### 5.1 `_agreement_math.py` — pure helpers

```python
# Signature stubs only — bodies are written by the implementer.

def signal_class_of(contributor: ContributingSignal) -> str:
    """
    Map a ContributingSignal to its signal class.
      - detector 'florence'   -> 'first_pass'
      - detector 'gdino'      -> 'first_pass'   # SAME CLASS as florence
      - detector 'gdino-sahi' -> 'tiled'
    Frame-class contributions are produced separately in agreement_scoring;
    this helper is detector-only.
    """

def confidence_from_score(score: int,
                          k_baseline: int = 2,
                          sigma: float = 1.0) -> float:
    """clip01(sigmoid((score - k_baseline) / sigma)). Pure float math."""

def coverage(detections: list[PipelineDetection]) -> float:
    """mean(1{agreement_score >= 2}); empty list -> 0.0 (not NaN)."""

def precision(detections: list[PipelineDetection]) -> float:
    """mean(1{agreement_score >= 3}); empty list -> 0.0 (not NaN)."""

def lower_gdino_score_thr(thr_in: float) -> float:
    """thr - min(0.10, thr*0.30), floored at 0.05.  Used by Level-1 ladder."""

def lower_cross_frame_theta(theta_in: float) -> float:
    """max(theta - 0.05, 0.7).  Used by Level-2 ladder.
    REGRESSION GUARD: NEVER returns theta/2."""
```

### 5.2 `agreement_scoring.py` — Dagster op

```python
@op(
    ins={"scene": In(SceneObservation)},
    out=Out(SceneObservation),
    tags={"phase": "4d"},
)
def agreement_scoring(context, scene: SceneObservation) -> SceneObservation:
    """
    Adds per-detection agreement_score + confidence and scene-level
    agreement_coverage + agreement_precision. Sets flagged + flag_reason
    for empty_detection_set and single_source_run.

    PURE op: no I/O, no model calls, no FAISS access. Returns a NEW
    SceneObservation; does not mutate input.

    Algorithm (per §3.13 / §6.1):
      1. For each detection:
           classes = {signal_class_of(s) for s in d.contributing_signals}
                   | {f"frame:{s.frame_id}" for s in d.contributing_signals}
         d.agreement_score = len(classes)
         d.confidence      = confidence_from_score(d.agreement_score)

      2. scene.agreement_coverage  = coverage(detections)
         scene.agreement_precision = precision(detections)

      3. Flagging:
         - empty detections AND norm(scene_embedding) > eps
              -> flagged=True, flag_reason="empty_detection_set"
         - empty detections AND norm(scene_embedding) <= eps
              -> flagged=False (blank frame; no detections is correct)
         - all detections have signal_classes == {"first_pass"} AND every
           contribution is detector='florence' AND only one frame_id seen
           across all signals
              -> flagged=True, flag_reason="single_source_run"

      4. scene.rerunDepth: copied through unchanged.
    """
```

### 5.3 `self_diagnosis.py` — Dagster DynamicOut op

```python
@op(
    ins={"scene": In(SceneObservation)},
    out=DynamicOut(RerunDirective),
    tags={"phase": "4d"},
)
def self_diagnosis(context, scene: SceneObservation):
    """
    DynamicOut fan-out per §3.14.

    Yields:
      - nothing                  : terminal — caller routes scene to assemble_result
      - DynamicOutput(directive) : one element with mapping_key=f"rerun_{next_depth}"
                                   triggering a rerun_branch in the same DAG

    Trigger:
      - scene.rerunDepth >= MAX_RERUNS:
           mutate scene.flagged=True, flag_reason="diagnosis_budget_exhausted",
           emit terminal (NO yield).
      - no-improvement bail-out:
           if scene.rerunDepth >= 1 and current coverage <= previous coverage,
           emit terminal with the PREVIOUS rerun's SceneObservation (the
           implementer threads previous-coverage through op-config or a
           debug field on RerunDirective; document the choice in the docstring).
      - else if any of:
             agreement_coverage  < tau_cov,
             agreement_precision < tau_prec,
             flag_reason in {"empty_detection_set", "single_source_run"}:
           strictness_level = scene.rerunDepth + 1
           overrides        = build_overrides(strictness_level, scene)
           yield DynamicOutput(
               RerunDirective(next_depth=strictness_level,
                              strictness_level=strictness_level,
                              overrides=overrides),
               mapping_key=f"rerun_{strictness_level}",
           )

    Override builder (per §6.4 strictness ladder; ADDITIVE per level):

      Level 1:
        - lower gdino_score_thr via lower_gdino_score_thr()
        - force SAHI on whole frame regardless of trigger density
        - re-run vlm_prompt_expansion with paraphrased Qwen seed; union prompts
        - force qwen7b for classification_refine

      Level 2 (adds to Level 1):
        - re-run gdino with synonym-rephrased prompts seeded by qwen3b
          (different model — reduces monoculture)
        - lower cross_frame_embedding_theta via lower_cross_frame_theta()
          (additive -0.05 floor 0.70 — NOT halved)

      Level 3+: unreachable; MAX_RERUNS=2 cap above terminates first.
    """
```

### 5.4 Wiring in `dagster_defs.py`

The DAG wiring (no body, just shape):

```python
# Pseudocode showing the shape; implementer writes idiomatic Dagster.
@graph
def detection_pipeline_graph():
    scene = ... # produced by upstream ops (sections 01/03/04/05/06)
    scored = agreement_scoring(scene)
    branches = self_diagnosis(scored)            # DynamicOut

    # collect() materialises the fan-out; rerun_branch lives in a sibling
    # section (section-06 owns box_fusion / dedup; the actual override-
    # consuming op stubs live where their model calls are). For THIS
    # section's DAG-integration test, rerun_branch can be a fake op
    # imported from tests/conftest.py.
    rerun_results = branches.map(rerun_branch).collect()

    # Re-score each rerun output, then fan back in.
    rescored = rerun_results.map(agreement_scoring).collect()

    # If branches was empty, scored flows directly to assemble_result;
    # otherwise the LAST rescored element wins (per "no-improvement bail-out"
    # the chain has already terminated by then).
    final = pick_final(scored, rescored)
    assemble_result(final)
```

`pick_final` is a one-line `@op` that returns the deepest non-rerun-needing
`SceneObservation` from the chain. Its body is trivial; spec it with a
docstring and a unit test in `test_self_diagnosis.py`.

---

## 6. Behaviour checklist (review before merging)

- [ ] `signal_class_of('gdino') == 'first_pass'` (NOT a unique class).
- [ ] `coverage([])` and `precision([])` return `0.0`, never `NaN`.
- [ ] Empty detections + non-blank scene → `flagged=True,
      flag_reason="empty_detection_set"`.
- [ ] Empty detections + blank scene → `flagged=False`.
- [ ] `single_source_run` flag fires only when EVERY detection is
      first-pass-only, ALL contributors are `florence`, and only ONE frame
      is represented.
- [ ] Level-2 cross-frame theta uses `max(theta - 0.05, 0.7)`, never `theta/2`.
- [ ] No-improvement bail-out emits the PREVIOUS rerun's result, not the
      latest (this is the whole point — the latest by definition has not
      helped).
- [ ] `rerunDepth >= MAX_RERUNS` terminates with `flag_reason=
      "diagnosis_budget_exhausted"`.
- [ ] `self_diagnosis` is a `DynamicOut` op in the SAME DAG — not a
      Dagster sub-run, not a daemon, not a sensor.
- [ ] `agreement_scoring` and `self_diagnosis` are pure-ish — no model
      calls, no HTTP, no FAISS reads/writes. The unit tests run without
      any fake-model HTTP responders.
- [ ] Both ops produce deterministic output for the same input
      (deterministic ordering: sort detections by `detection_id` before
      scoring; sort directive overrides by key before emitting).

---

## 7. Out of scope (do NOT implement here)

- The `rerun_branch` op body itself (gdino re-detection, SAHI re-tile,
  classification re-refine). That belongs to the ops in sections
  03/04/05/06 — this section only **emits the directive** that drives them.
  For DAG-integration tests, use a fake `rerun_branch` from
  `pipeline-service/tests/conftest.py`.
- `assemble_result` (covered by section-01 stub + later finalisation in
  section-10).
- CI-gating threshold values themselves — they are tuned in section-09 once
  the eval corpus exists. This section consumes the defaults from
  `config.py` (`tau_cov=0.70`, `tau_prec=0.40`, `MAX_RERUNS=2`).
- The mobile/api-service contract — the `flag_reason` enum is already
  declared in `api-service/src/types/pipeline.ts` (section-02). This
  section MUST emit only those documented strings: `empty_detection_set`,
  `single_source_run`, `diagnosis_budget_exhausted`. `assemble_failed` is
  emitted by `assemble_result`, not here.

---

## 8. Done criteria

1. All four test files listed in §4 exist, and `cd pipeline-service && uv
   run pytest tests/unit/ops/test_agreement_scoring.py
   tests/unit/ops/test_self_diagnosis.py tests/unit/test_agreement_math.py
   tests/integration/test_self_diagnosis_dag.py` passes locally.
2. `agreement_scoring.py`, `self_diagnosis.py`, `_agreement_math.py` exist
   with implementations matching the contracts in §5.
3. `dagster_defs.py` wires the DynamicOut fan-out as described in §5.4 and
   the integration test asserts the lineage shape.
4. Three regression tests are GREEN and explicitly named in their test IDs:
   - `test_florence_and_gdino_share_first_pass_class`
   - `test_level2_theta_subtracts_005_not_halved`
   - `test_empty_detection_set_returns_zero_not_nan`
5. `make smoke` (existing) still passes — the new ops do not regress the
   pass-through stub behaviour for the synthetic one-frame scene.
6. No model HTTP calls in this section's tests (verified by inspecting test
   imports — `models/florence_client.py`, `models/ollama_client.py`,
   `models/grounding_dino.py`, `models/dinov2.py` MUST NOT be imported
   from any test file in §4).

<!-- END SECTION CONTENT -->