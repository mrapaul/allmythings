Now I have all the context I need. Let me generate the section content for section-06-fusion.

## section-06-fusion — Box Fusion, Cross-Pass / Cross-Frame Dedup, and Label-Text Compatibility Gate

> Phase 4c of the Detection Pipeline Structural Rewrite.
>
> This section implements the fusion stage of the Dagster pipeline:
> - `box_fusion` — Weighted Boxes Fusion (WBF) per frame across all detectors
> - `cross_pass_dedup` — within-frame dedup across detector passes
> - `cross_frame_dedup` — across-frame dedup over the 3-frame burst, using a per-run in-memory FAISS index
> - `label_text_compat()` — a sentence-transformer-backed **negative gate** used by both dedup ops
>
> An adversarial fixture set is committed alongside the tests so the negative gate's threshold cannot silently regress.

---

### 1. Background (read this first)

#### 1.1 Where this section sits in the DAG

```
... → effsam_segment → box_fusion → crop_embedding → cross_pass_dedup → cross_frame_dedup → classification_refine → ...
```

The pipeline is **multi-pass, multi-model, multi-frame**: the mobile sends a 3-frame burst, several detectors run on each frame (Florence, Grounding DINO, optional SAHI tile re-pass), and this section is the layer that collapses overlapping/duplicate detections into a single `SceneObservation`.

The agreement-scoring scheme downstream (§3.13, section-07) treats every signal as suspect by default and groups them into **signal classes**:
- `"first_pass"` — Florence + Grounding DINO together (they are NOT independent)
- `"tiled"` — Grounding DINO via SAHI
- `"frame:<frame_id>"` — each captured frame independently

For that scheme to work, this section must:
- Preserve `contributing_signals` (the underlying `(detector, frame_id, raw_confidence)` tuples) through fusion, dedup-within-frame, and dedup-across-frames
- Produce **byte-deterministic** output for byte-equal input (`pipeline-service/tests/replay/fixtures/`)
- Define explicit empty-set semantics (never NaN, never raise on empty)

#### 1.2 Why a sentence-transformer "negative gate"

If we only use crop-embedding cosine + IoU to merge detections, we will eventually merge "plant" and "vase" because they share spatial locality and visual texture in cluttered scenes. We add a **label-text compatibility check** as a *blocker* — it does not trigger merges, it only blocks merges of labels that are clearly different.

- Encoder: `sentence-transformers/all-MiniLM-L6-v2` (384-d, runs CPU/MPS, ~3 ms/pair).
- Threshold: `cos(emb_a, emb_b) ≥ 0.6`. Tunable via `config.thresholds.labelTextCompatTheta`.
- Calibration evidence: `("sofa","couch")→True, ("table","chair")→False, ("lamp","light")→True, ("plant","vase")→False`.

#### 1.3 Dependencies

This section depends on:

- **section-04-embedding-and-prompt** — provides `crop_embedding` (DINOv2 ViT-B/14 → 768-d float16, L2-normalised; int8-quantised on the way to the device) and `scene_embedding` plumbing. The output of `crop_embedding` is the cosine input for both dedup ops here.
- **section-05-ml-models-spike** — provides `grounding_dino_detect`, `sahi_recovery`, `effsam_segment`. The fused boxes from this section feed `effsam_segment` indirectly (segment runs against `FusedFrame[]`), but the spike must have settled the model choices first so the detector list is stable.

This section is consumed by:
- **section-07-agreement-and-diagnosis** — `agreement_scoring` reads `contributing_signals` set here.

#### 1.4 Determinism contract (cross-cutting)

Every op in this section must obey the §3.0 cross-cutting rules:

- **Deterministic ordering.** Inputs are sorted by an explicit, stable key before processing:
  - `box_fusion`: per-frame fused boxes are sorted `(detector, frame_id, label, x, y)` before WBF.
  - `cross_pass_dedup` / `cross_frame_dedup`: detection IDs sorted lexicographically before FAISS lookup.
  - No reliance on Python dict / set iteration order.
- **Empty-set semantics.** Numeric outputs over empty input are `0.0`, never `NaN`. Lists are `[]`, never `None`.
- **WBF library RNG seeded** at module import (deterministic given the sort).
- **Replay tests** — golden JSON fixtures under `pipeline-service/tests/replay/fixtures/` re-invoke the op and assert byte-equal output.

---

### 2. Files to create / modify

All paths absolute under `/Users/mrarindampaul/Develop/allmythings/`.

**New op files (Python, in `pipeline-service/pipeline_service/ops/`):**

- `pipeline-service/pipeline_service/ops/box_fusion.py`
- `pipeline-service/pipeline_service/ops/cross_pass_dedup.py`
- `pipeline-service/pipeline_service/ops/cross_frame_dedup.py`

**New helper / model files:**

- `pipeline-service/pipeline_service/models/label_encoder.py` — wraps `sentence-transformers/all-MiniLM-L6-v2` (384-d). Exposes `encode(label: str) -> NDArray[float32]` with per-run cache (a simple `dict[str, np.ndarray]` lifecycle-tied to the run). Loaded once at sidecar startup, warm-up forward pass on a no-op string.
- `pipeline-service/pipeline_service/storage/faiss_index.py` — already declared in §2 of the master plan; this section is the first consumer. Must support `build(detection_ids, vectors)`, `knn(vector, k)`, `extend(detection_id, vector)`. **Per-run only**, never persisted across runs.
- `pipeline-service/pipeline_service/ops/_label_compat.py` (or inlined into `cross_pass_dedup.py` / `cross_frame_dedup.py` — implementer's choice) — exposes:
  ```python
  def label_text_compat(a: str, b: str, *, threshold: float, encoder: LabelEncoder) -> bool: ...
  ```

**Modified files:**

- `pipeline-service/pipeline_service/dagster_defs.py` — wire the three new ops into the asset graph. `box_fusion` is an input to `crop_embedding`; `cross_pass_dedup` runs after `crop_embedding`; `cross_frame_dedup` runs after `cross_pass_dedup` and before `classification_refine`.
- `pipeline-service/pipeline_service/config.py` — add `box_fusion.iou_thr` (0.5), `box_fusion.skip_box_thr` (0.0), `box_fusion.detector_weights` (`{florence: 0.5, gdino: 1.0, gdino-sahi: 0.8}`), `thresholds.cross_pass_iou` (0.7), `thresholds.cross_pass_embedding_theta` (0.88), `thresholds.cross_frame_embedding_theta` (0.85), `thresholds.label_text_compat_theta` (0.6). Defaults must match §5.1 / §6.4 of the master plan.
- `pipeline-service/pipeline_service/types.py` — ensure `FusedDetection`, `FusedFrame`, `DedupedFrame`, `ContributingSignal` exist as Pydantic dataclasses (see §3 below). They may already be stubbed by section-01.

**Dependency additions to `pipeline-service/pyproject.toml`:**

- `weightedboxesfusion` (or `ensemble-boxes`, whichever the team prefers — the test uses the `WeightedBoxesFusion` symbol; the implementer should pick the canonical PyPI package and add it).
- `sentence-transformers`
- `faiss-cpu` (Apple-Silicon path: `faiss-cpu` is the supported wheel; do not depend on `faiss-gpu`).
- `numpy` (already present)

The implementer must `uv add` each of these and commit `uv.lock`.

**Test files to create:**

- `pipeline-service/tests/unit/ops/test_box_fusion.py`
- `pipeline-service/tests/unit/ops/test_cross_pass_dedup.py`
- `pipeline-service/tests/unit/ops/test_cross_frame_dedup.py`
- `pipeline-service/tests/unit/ops/test_label_text_compat.py` — parametrised over the adversarial fixture set
- `pipeline-service/tests/replay/fixtures/label_compat_pairs.json` — adversarial fixture set (committed)
- `pipeline-service/tests/replay/fixtures/box_fusion/` — golden input/output JSON for at least one canonical scene (3 frames, mixed detectors)
- `pipeline-service/tests/replay/fixtures/cross_frame_dedup/` — golden input/output JSON

---

### 3. Type contracts (mirror of §5.1 / §5.2)

All types live in `pipeline-service/pipeline_service/types.py` as Pydantic dataclasses. They mirror the TS contract in `api-service/src/types/pipeline.ts` exactly (round-trip fixture lives in §5 of the master plan and is verified by section-04's contract test).

```python
class ContributingSignal:
    detector: Literal['florence', 'gdino', 'gdino-sahi']
    frame_id: FrameId
    raw_confidence: Optional[float]   # None for Florence (no score)

class FusedDetection:
    detection_id: DetectionId
    frame_id: FrameId
    bbox: BBox
    primary_label: str
    alternates: list[tuple[str, float]]
    contributing_signals: list[ContributingSignal]

class FusedFrame:
    frame_id: FrameId
    detections: list[FusedDetection]

class DedupedFrame:
    frame_id: FrameId
    detections: list[FusedDetection]   # post-merge; same shape

class SceneObservation:
    # Full shape per §5.1 — only fields touched by THIS section:
    detections: list[FusedDetection]   # cross-frame dedup'd
    # agreement_score / confidence are populated downstream in section-07
```

Notes:
- `BBox` is `{x: float, y: float, width: float, height: float}` in pixel coordinates of the original frame. Frame dimensions are resolved by upstream ops; this section never sees raw pixels.
- `DetectionId` is a UUID minted by `box_fusion` (one per cluster). Dedup ops preserve the survivor's id.
- `contributing_signals` accumulates monotonically: `box_fusion` writes the initial set; `cross_pass_dedup` and `cross_frame_dedup` *append* discarded detections' signals to the survivor's list.

---

### 4. Op contracts

#### 4.1 `box_fusion`

**Source ref:** master plan §3.8.

**Input:** `list[FrameDetections]` — one per (detector, frame_id), all detectors that emitted boxes for any frame in the burst.

**Output:** `list[FusedFrame]` — one per `frame_id`, containing the WBF-fused detections for that frame.

**Behaviour:**

1. Group input by `frame_id`.
2. Sort the group's detections by `(detector, frame_id, label, x, y)` before passing to WBF (determinism guarantee).
3. Apply Weighted Boxes Fusion (WBF) per frame across all detectors. Hyperparameters from `config.box_fusion`:
   - `iou_thr = 0.5`
   - `skip_box_thr = 0.0`
   - `detector_weights = {florence: 0.5, gdino: 1.0, gdino-sahi: 0.8}`
4. For each cluster:
   - The cluster keeps the highest-weighted-confidence label as `primary_label`. The other labels become `alternates: list[(label, confidence)]`.
   - `contributing_signals` records every `(detector, frame_id, raw_confidence)` tuple that contributed.
   - `detection_id` is a freshly-minted UUID.
5. Florence's `raw_confidence=None` is treated as `0.5` for WBF weighting purposes only — the recorded `raw_confidence` in `contributing_signals` stays `None` (so downstream agreement scoring sees explicit absence).
6. **WBF library RNG** seeded at module import (some implementations break ties with internal randomness — pin the seed).

**Empty-set:** input with no frames OR no detections per frame → emit `FusedFrame(frame_id=<id>, detections=[])` for each `frame_id` in the input. If the input itself is `[]`, return `[]`.

**Failure:** WBF is pure-Python after the sort; no model calls. There are no transient failure modes here. If the WBF library raises on malformed input, the op re-raises (Dagster will surface it as an op failure).

**Determinism check:** calling `box_fusion(input)` twice on the same input must produce byte-equal output (covered by the replay-test fixture).

#### 4.2 `cross_pass_dedup`

**Source ref:** master plan §3.10.

**Input:** `FusedFrame, EmbeddedFrame` for a **single frame**, post-SAHI. (One op invocation per frame.)

**Output:** `DedupedFrame(frame_id, detections: list[FusedDetection])`.

**Behaviour:**

Within one frame's detections, merge two boxes `a` and `b` if **either**:

1. `IoU(a, b) > config.thresholds.cross_pass_iou` (default 0.7) **AND** `label_text_compat(a.primary_label, b.primary_label) == True`; **OR**
2. `cosine(crop_embedding(a), crop_embedding(b)) ≥ config.thresholds.cross_pass_embedding_theta` (default 0.88) **AND** `label_text_compat(a.primary_label, b.primary_label) == True`.

Note: in both branches, `label_text_compat` is the **negative gate** — it can only block merges, never trigger them.

Merge rules:
- The survivor is the detection with the **highest `len(contributing_signals)`** (more corroborated wins).
- Tie-break: lexicographically smallest `detection_id` (deterministic).
- The discarded detection's `contributing_signals` are **appended** to the survivor's list (ordered by `(detector, frame_id, raw_confidence-with-None-last)`).
- The survivor's `bbox`, `primary_label`, and `alternates` are unchanged.
- Detections without crop embeddings (flagged `embedding_unavailable=True` upstream by §3.9) participate only in the IoU branch.

**Empty-set:** input `FusedFrame.detections == []` → `DedupedFrame(frame_id, detections=[])`.

**Failure:** none beyond label-encoder transient failure. The `label_text_compat` helper retries 3× on encoder error and falls back to `True` (i.e., does not block) on persistent failure — degraded behaviour, but never blocks the run.

#### 4.3 `cross_frame_dedup`

**Source ref:** master plan §3.11.

**Input:** `list[DedupedFrame]` for the burst (v1: exactly 3 frames).

**Output:** `SceneObservation` with a single dedup'd detection set across the burst. Only the `detections` field is populated by this op; `agreement_*` and `confidence` come from section-07.

**Behaviour:**

Maintain a **FAISS in-memory index for the run only** (`storage/faiss_index.py`). Populate it iteratively:

1. Sort input frames by `frame_id` (stable order for determinism).
2. Iterate frame-by-frame, for each detection in the frame:
   - Look up the K=3 nearest neighbours from already-indexed detections.
   - Merge with the best candidate iff **all three** of these hold:
     1. `cosine(crop_embedding) ≥ config.thresholds.cross_frame_embedding_theta` (default 0.85).
     2. `label_text_compat(primary_label_a, primary_label_b) == True`. (negative gate; threshold 0.6.)
     3. The two detections come from **different `frame_id`s**. Same-frame pairs are NEVER merged here — that's `cross_pass_dedup`'s job.
   - On merge: append the new detection's `contributing_signals` to the survivor; do NOT add the merged detection to the index (it's now subsumed).
   - On no-merge: add the new detection to the index.
3. Detections flagged `embedding_unavailable=True` are still emitted, but skip FAISS lookup entirely (excluded from cross-frame dedup).
4. Output detection ordering: sort by `(primary_label, frame_id, detection_id)` for determinism.

The FAISS index is built and torn down per-run; never persisted to `DAGSTER_HOME`.

**Empty-set:** input `[]` → `SceneObservation(detections=[], frame_ids=[], agreement_coverage=0.0, agreement_precision=0.0, ...)`. Other `SceneObservation` fields take their type's zero value (empty lists, `False`, `0`).

**Failure:** none beyond label-encoder behaviour described above. FAISS is in-memory and cannot fail transiently in any meaningful way — if it raises on malformed vectors, the op re-raises.

#### 4.4 `label_text_compat()`

**Source ref:** master plan §3.11.

**Signature:**

```python
def label_text_compat(
    a: str,
    b: str,
    *,
    threshold: float,             # config.thresholds.label_text_compat_theta, default 0.6
    encoder: LabelEncoder,
) -> bool:
    """
    Sentence-transformer negative gate.

    Returns True iff cos(encoder.encode(a), encoder.encode(b)) >= threshold.
    Encodings are cached on `encoder` for the lifetime of one Dagster run.
    """
```

- Encoder model: `sentence-transformers/all-MiniLM-L6-v2`. Embedding dim: 384. Asserted at runtime (regression for ViT/MiniLM swap).
- Cache: per-run dictionary `dict[str, np.ndarray]` on the `LabelEncoder` instance. Cleared between runs by lifecycle hook in `dagster_defs.py`.
- Determinism: encoder loaded with `eval()` mode and frozen weights; identical input → identical output (already true for sentence-transformers, but pinned via fixture-comparison test).

---

### 5. Tests (write FIRST, before any implementation)

All tests use mocked models (no live HTTP, no live model loads beyond the small MiniLM CPU model — and even MiniLM is mocked in unit tests; only the `test_label_text_compat.py` adversarial set uses the real model).

#### 5.1 `pipeline-service/tests/unit/ops/test_box_fusion.py`

```python
# Test: WBF iou_thr=0.5 fuses two overlapping boxes (IoU 0.6) into one cluster
# Test: WBF does NOT fuse non-overlapping boxes (IoU 0.2)
# Test: detector_weights honoured — Florence(0.5) + gdino(1.0) overlapping
#       cluster keeps gdino's primary_label as primary
# Test: Florence raw_confidence=None is treated as 0.5 for WBF weighting,
#       but the recorded ContributingSignal.raw_confidence stays None
# Test: contributing_signals records every (detector, frame_id, raw_confidence)
#       that contributed to the cluster (no drops)
# Test: deterministic — inputs sorted (detector, frame_id, label, x, y) before
#       fusion; calling box_fusion twice on the same input produces byte-equal output
# Test: empty input list → []; input with frames but no detections per frame →
#       FusedFrame(frame_id=<id>, detections=[]) for each frame
# Test: alternates list contains the suppressed labels with their raw scores
# Test: replay-test — golden fixture under tests/replay/fixtures/box_fusion/
#       produces byte-equal output
```

#### 5.2 `pipeline-service/tests/unit/ops/test_cross_pass_dedup.py`

```python
# Test: merges two boxes within one frame when IoU > 0.7 AND label_text_compat
# Test: merges when crop_embedding cosine ≥ 0.88 AND label_text_compat
# Test: does NOT merge when label_text_compat is False (e.g., "table"/"chair")
#       even with high IoU or high cosine — negative gate is authoritative
# Test: merge keeps the detection with the highest len(contributing_signals);
#       discarded detection's signals are appended to the survivor
# Test: tie on len(contributing_signals) → lexicographically smallest detection_id wins
# Test: detection with embedding_unavailable=True participates in IoU branch only
# Test: empty input → DedupedFrame(detections=[])
# Test: non-overlapping detections pass through unchanged
# Test: label_encoder transient failure → label_text_compat returns True (degraded
#       fallback); op succeeds
```

#### 5.3 `pipeline-service/tests/unit/ops/test_cross_frame_dedup.py`

```python
# Test: 3 frames each with 1 detection of the same object →
#       SceneObservation has 1 detection whose contributing_signals
#       includes the per-frame signals from all 3 frames
# Test: 3 frames with 1 different object each → 3 detections, no merges
# Test: dedup requires (cosine ≥ 0.85) AND (label_text_compat == True)
#       AND (different frame_ids) — same-frame pairs are NEVER merged here
#       (that's cross_pass_dedup's job)
# Test: label_text_compat negative gate blocks merges of "plant"/"vase"
#       even when crop embeddings are similar
# Test: FAISS index is per-run only — no persistence across runs (rebuilt each
#       time; sentinel: instantiate the op twice in succession and confirm the
#       second call sees an empty index at start)
# Test: detections with embedding_unavailable=True are emitted but skip FAISS lookup
# Test: deterministic output ordering — sort by (primary_label, frame_id, detection_id)
# Test: empty input → SceneObservation(detections=[]) with zero-valued metrics
# Test: replay-test — golden fixture under tests/replay/fixtures/cross_frame_dedup/
#       produces byte-equal output
```

#### 5.4 `pipeline-service/tests/unit/ops/test_label_text_compat.py`

```python
# Adversarial fixture set lives at tests/replay/fixtures/label_compat_pairs.json.
# Every entry is asserted as a parametrised pytest case.

# Calibration sentinels (from §3.11):
# Test: ("sofa", "couch") → True
# Test: ("table", "chair") → False
# Test: ("lamp", "light") → True
# Test: ("plant", "vase") → False
# Test: ("coffee mug", "cup") → True
# Test: ("dining chair", "office chair") → True   (same category)
# Test: encoder is sentence-transformers/all-MiniLM-L6-v2 (asserted by inspecting
#       loaded model name + embedding dim 384)
# Test: threshold 0.6 is read from config.thresholds.label_text_compat_theta
# Test: encodings are cached within a run — second call with same string does
#       not re-invoke encoder.encode (verified via mock counter)
# Test: encoder transient failure retried 3× then degrades to True
```

#### 5.5 Adversarial fixture file

`pipeline-service/tests/replay/fixtures/label_compat_pairs.json` — committed alongside the tests. Format:

```json
[
  {"a": "sofa", "b": "couch", "expected": true,  "notes": "synonym"},
  {"a": "table", "b": "chair", "expected": false, "notes": "different category"},
  {"a": "lamp", "b": "light", "expected": true,  "notes": "synonym"},
  {"a": "plant", "b": "vase", "expected": false, "notes": "co-located but different"},
  {"a": "coffee mug", "b": "cup", "expected": true,  "notes": "subtype"},
  {"a": "dining chair", "b": "office chair", "expected": true, "notes": "same category"}
]
```

The fixture is the contract; new pairs may be added in dedicated PRs only, and the metric-impact analysis is recorded alongside (per §3.0 replay-fixture refresh policy).

---

### 6. Implementation order (TDD)

1. **Stub the types.** Confirm `FusedDetection`, `FusedFrame`, `DedupedFrame`, `ContributingSignal` exist in `pipeline_service/types.py` per §3 of this section. Stub if missing.
2. **Write failing tests.** Create the four test files in §5 with the test names above. They will all fail.
3. **Commit the adversarial fixture.** Add `label_compat_pairs.json` so the parametrised test in §5.4 is at least loadable.
4. **Implement `LabelEncoder` + `label_text_compat()`.** Just enough to make §5.4 green.
5. **Implement `box_fusion`.** Make §5.1 green. Pin the WBF RNG seed at module import.
6. **Implement `FaissIndex`** in `pipeline_service/storage/faiss_index.py`. Per-run lifecycle, basic `build/extend/knn` API.
7. **Implement `cross_pass_dedup`.** Make §5.2 green.
8. **Implement `cross_frame_dedup`.** Make §5.3 green.
9. **Capture replay-test golden fixtures.** Run each op once on a representative input, snapshot output, commit under `tests/replay/fixtures/box_fusion/` and `tests/replay/fixtures/cross_frame_dedup/`.
10. **Wire into `dagster_defs.py`.** Add the three ops to the asset graph between `effsam_segment` and `classification_refine`. Verify the existing integration test from section-01 still passes (the three new ops are now real, not stubs).
11. **Add config entries.** All thresholds and weights into `config.py` with the defaults from §2 above.
12. **Update `pyproject.toml` + `uv.lock`.** Add `weightedboxesfusion` (or chosen WBF lib), `sentence-transformers`, `faiss-cpu`.

---

### 7. Test command

This section is pure-Python under `pipeline-service/`. Use the project default:

```
cd pipeline-service && uv run pytest tests/unit/ops/test_box_fusion.py \
                                      tests/unit/ops/test_cross_pass_dedup.py \
                                      tests/unit/ops/test_cross_frame_dedup.py \
                                      tests/unit/ops/test_label_text_compat.py \
                                      tests/replay
```

Full section gate: `cd pipeline-service && uv run pytest`.

---

### 8. Done checklist

- [ ] Types `FusedDetection`, `FusedFrame`, `DedupedFrame`, `ContributingSignal` exist in `pipeline_service/types.py` matching §5.1 of the master plan.
- [ ] `box_fusion` op implemented with WBF; detector weights `{florence: 0.5, gdino: 1.0, gdino-sahi: 0.8}`; deterministic ordering enforced; empty-set semantics correct; all §5.1 tests green.
- [ ] `cross_pass_dedup` op implemented; merges only when label-text-compat passes; `contributing_signals` accumulated; all §5.2 tests green.
- [ ] `cross_frame_dedup` op implemented; per-run FAISS index; same-frame pairs never merged; embedding-unavailable detections still emitted; all §5.3 tests green.
- [ ] `label_text_compat()` implemented over `sentence-transformers/all-MiniLM-L6-v2` at threshold 0.6 (configurable); per-run encoding cache; degraded-to-True on encoder failure; all §5.4 tests green.
- [ ] Adversarial fixture `tests/replay/fixtures/label_compat_pairs.json` committed; parametrised test loads it.
- [ ] Replay-test fixtures committed for `box_fusion` and `cross_frame_dedup`; byte-equal output asserted.
- [ ] `pyproject.toml` + `uv.lock` updated with `weightedboxesfusion` (or equivalent), `sentence-transformers`, `faiss-cpu`.
- [ ] `dagster_defs.py` wires the three ops into the asset graph between `effsam_segment` and `classification_refine`.
- [ ] `config.py` carries all thresholds with the defaults specified above.
- [ ] No NaN can appear in any output — empty-set tests cover this.
- [ ] `make eval` (when run; gating starts in section-09) does not regress on metrics emitted by section-04 / section-05 — sanity check, not a hard gate yet.