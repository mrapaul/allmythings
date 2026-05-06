Now I have all the context I need. Let me generate the section content for section-05-ml-models-spike.

# section-05-ml-models-spike — Apple-Silicon Spike + Risky New Detection / Segmentation Ops

## Goal

Implement the three Apple-Silicon-risky Dagster ops that introduce open-vocabulary detection, tiled re-detection, and promptable segmentation:

- `grounding_dino_detect` (§3.5)
- `sahi_recovery` (§3.6)
- `effsam_segment` (§3.7)

This section is **spike-gated**. Before any production op code ships, three integration tests run the §11.1 Apple-Silicon viability spike against real models. If the spike fails on latency or memory, the section's fallback path is taken (alternative model, **same op contracts**). The contracts in `pipeline_service/types.py` MUST NOT change between primary and fallback paths.

## Dependencies (already shipped)

- **section-01** — `pipeline-service/` skeleton, `pipeline_service/types.py` Pydantic mirror, FastAPI sidecar, op-replay infrastructure under `tests/replay/`, log redaction wiring, `frame_intake` and `assemble_result`.
- **section-04** — `scene_embedding`, `vlm_prompt_expansion`, `crop_embedding` ops; `models/dinov2.py`. The `PromptList` type and prompt cache are pre-existing inputs to `grounding_dino_detect`.
- `models/ollama_client.py` per-model `asyncio.Semaphore(1)` (from section-03) is already in place.

This section adds:
- `pipeline_service/models/grounding_dino.py`
- `pipeline_service/models/effsam.py`
- `pipeline_service/ops/grounding_dino_detect.py`
- `pipeline_service/ops/sahi_recovery.py`
- `pipeline_service/ops/effsam_segment.py`
- All tests listed under "Tests First" below.

## Test command

`cd pipeline-service && uv run pytest`

The Apple-Silicon spike tests are auto-skipped when not running on `darwin / arm64` so CI on Linux runners stays green. They MUST run (and pass) on the developer Mac before this section is considered done.

---

## Tests FIRST

Write these tests, watch them fail, then implement. Tests are stubs — implementer writes assertions, fixtures, and mocks.

### 1. Spike acceptance — `grounding_dino_detect`

`pipeline-service/tests/integration/test_gdino_apple_silicon_spike.py`

```python
# Test: model loads on Apple Silicon (skip if not on macOS arm64)
# Test: per-frame inference latency ≤ 2s (3s if BERT text encoder falls back to CPU)
# Test: resident memory ≤ 3 GB during inference
# Test: spike acceptance — runs against §11.1 fixture set; FAILS the build
#       if criteria not met (this is the gate before Phase 4b ships)
```

Acceptance criteria from §11.1:

| Model | Acceptance criteria |
| --- | --- |
| Grounding DINO 1.5 Edge | Latency: per-frame inference (image + text encoder) ≤ 2 s on M2 Pro / M3 Pro at 768 px input. Memory: resident ≤ 3 GB. Path: ONNX-Runtime CoreML EP for image encoder; if CPU fallback for BERT text encoder is the only viable route, latency ceiling rises to 3 s before fallback. |

Fixture set: 5 hand-curated room photos under `pipeline-service/tests/fixtures/spike/rooms/*.webp`. The same fixtures are reused by the EffSAM spike. Memory is measured via `psutil.Process().memory_info().rss` sampled during the inference loop.

### 2. Spike acceptance — `effsam_segment`

`pipeline-service/tests/integration/test_effsam_apple_silicon_spike.py`

```python
# Test: 30-box scene end-to-end ≤ 2s on M2 Pro / M3 Pro
# Test: median mask IoU with bbox ≥ 0.5 on a 5-image fixture set
# Test: resident memory ≤ 1 GB
```

Acceptance criteria from §11.1:

| Model | Acceptance criteria |
| --- | --- |
| EfficientSAM-Ti | End-to-end (NOT per-crop): for a 30-box scene at 640 px, total ≤ 2 s. Memory: resident ≤ 1 GB. Mask quality: median IoU with bbox ≥ 0.5 on a hand-curated 5-image fixture set. |

The "30-box scene" is synthesised by sampling 30 deterministic bboxes from one of the spike fixture frames. Mask IoU is `len(mask & bbox) / len(mask | bbox)`.

### 3. Total stack ceiling check

A small helper test in the same spike module asserts the §11.1 *total stack ceiling*: starting from the warm-up sidecar boot (Florence + gdino + EffSAM + DINOv2 + sentence-transformers all loaded), resident process memory ≤ 6 GB. This is the hard ceiling on a 16 GB Mac. Skipped in CI; run on the developer Mac at sign-off.

### 4. `grounding_dino_detect` unit tests

`pipeline-service/tests/unit/ops/test_grounding_dino_detect.py`

```python
# Test: filters detections below config.thresholds.gdino_score_thr (default 0.30)
# Test: each prompt produces 0..N detections; raw_confidence carries model score
# Test: per-frame retry + degraded fallback semantics same as florence_detect
# Test: detector field is "gdino" on every emitted detection
# Test: empty PromptList → emits FrameDetections(detections=[], detector_error=False)
```

Use a fake model client that the op imports through `pipeline_service.models.grounding_dino`. The unit tests MUST NOT load the real model.

Determinism / empty-set rules from §3.0 still apply:
- Empty `PromptList(prompts=[])` → emit `FrameDetections(detector="gdino", detections=[])` per frame, no error.
- Per-frame retry 3× on transient failure; final-fail per frame → `FrameDetections(detector_error=True, detections=[])` for that frame only — never aborts the op.

### 5. `sahi_recovery` unit tests

`pipeline-service/tests/unit/ops/test_sahi_recovery.py`

```python
# Test: triggers ONLY when first-pass density < config.sahi_trigger_density
# Test: skipped frames produce no FrameDetections output (not empty — none)
# Test: tile boxes are re-projected to full-frame coordinates correctly
# Test: tiles overlapping with first-pass boxes (IoU > 0.5) are deduplicated out
# Test: tile retries on transient failure; persistent tile failure → recorded
#       in tile_errors but op succeeds
# Test: >50% tile failure rate elevates run-level warning (downstream
#       agreement_scoring picks this up)
# Test: detector field is "gdino-sahi" on every emitted detection
```

The trigger comparison is `first_pass_density < config.thresholds.sahi_trigger_density` where density is `len(detections_in_frame) / frame_megapixels`. Default trigger is 5 detections per megapixel.

The "skipped frames produce no output" assertion is meaningful — distinguish "frame skipped" (no FrameDetections record at all) vs "frame triggered but no recovered boxes" (FrameDetections with empty `detections`). Downstream `box_fusion` (section-06) relies on this distinction.

### 6. `effsam_segment` unit tests

`pipeline-service/tests/unit/ops/test_effsam_segment.py`

```python
# Test: emits Mask per box on happy path
# Test: mask IoU < 0.4 with input bbox → mask dropped (likely occlusion bleed)
# Test: EfficientSAM unavailable → op succeeds with empty masks; downstream
#       crop_embedding falls back to bbox crop
# Test: per-box failure does not abort op
```

`Mask` is encoded as RLE bytes (`mask.rle_bytes`) so it can later be base64'd into `PipelineDetection.maskRleB64`. The IoU=0.4 threshold lives in config.

### 7. Cross-cutting op-concerns coverage

These tests already exist from section-01 (`pipeline-service/tests/unit/test_op_concerns.py`) but MUST pass for the three new ops too:

- Deterministic ordering: same input in two orderings → byte-equal output.
- Empty-set numeric output is `0.0`, not `NaN`.
- Replay test infrastructure: a fixture under `tests/replay/fixtures/` for one happy-path call to each new op produces byte-equal output on replay.

Add three new replay fixtures:
- `tests/replay/fixtures/grounding_dino_detect_basic.json`
- `tests/replay/fixtures/sahi_recovery_triggered.json`
- `tests/replay/fixtures/effsam_segment_basic.json`

### 8. Spike-gating mechanism

Add `pipeline-service/tests/integration/test_spike_gate.py`:

```python
# Test: if both spike tests passed (sentinel file at .spike-gate.json with
#       all criteria met), production-op tests load the primary model client.
# Test: if the spike sentinel records a failure, production-op tests load
#       the corresponding fallback model client (OWLv2-Base / YOLO-World-S /
#       MobileSAM) — and the op contracts (output types) MUST be byte-equal.
```

The spike sentinel is written by the two spike integration tests (or by a manual `make spike` target — see Implementation below).

---

## Implementation details

### File layout produced by this section

```
pipeline-service/
├── pipeline_service/
│   ├── models/
│   │   ├── grounding_dino.py         # NEW
│   │   └── effsam.py                 # NEW
│   └── ops/
│       ├── grounding_dino_detect.py  # NEW
│       ├── sahi_recovery.py          # NEW
│       └── effsam_segment.py         # NEW
└── tests/
    ├── fixtures/
    │   └── spike/
    │       └── rooms/                # 5 hand-curated room WebPs
    ├── integration/
    │   ├── test_gdino_apple_silicon_spike.py     # NEW
    │   ├── test_effsam_apple_silicon_spike.py    # NEW
    │   └── test_spike_gate.py                    # NEW
    ├── unit/
    │   └── ops/
    │       ├── test_grounding_dino_detect.py     # NEW
    │       ├── test_sahi_recovery.py             # NEW
    │       └── test_effsam_segment.py            # NEW
    └── replay/
        └── fixtures/
            ├── grounding_dino_detect_basic.json  # NEW
            ├── sahi_recovery_triggered.json      # NEW
            └── effsam_segment_basic.json         # NEW
```

### Step 1 — capture the spike fixtures

Hand-curated 5 room photos at 1280-px longest edge (matches mobile upload encoder), checked into `pipeline-service/tests/fixtures/spike/rooms/`. These are NOT generated; they are committed binary fixtures small enough (~200 KB each) for the repo. Each frame must:

- Contain ≥ 8 visible discrete household objects (so density tests are meaningful).
- Cover at least 3 distinct rooms (kitchen / living / bedroom — diversity prevents prompt-set overfitting).
- Be free of human faces (the spike runs WITHOUT face-redaction; sources should be PII-clean to begin with).

### Step 2 — run the spike

`make spike` is added to the project Makefile (in section-01's `make` surface; this section adds the target body):

```
spike:
\tcd pipeline-service && uv run pytest tests/integration/test_gdino_apple_silicon_spike.py tests/integration/test_effsam_apple_silicon_spike.py -v
```

The two spike tests, on success, write `pipeline-service/.spike-gate.json`:

```json
{
  "gdino": { "passed": true,  "model": "grounding-dino-1.5-edge",
             "p50_ms": 1450, "rss_mb": 2680 },
  "effsam": { "passed": true, "model": "efficientsam-ti",
              "p50_ms_30box": 1820, "rss_mb": 920, "median_iou": 0.61 },
  "stack_ceiling_rss_mb": 5400,
  "host": "Darwin arm64",
  "captured_at": "..."
}
```

If a model fails its criteria, the corresponding entry has `"passed": false, "fallback": "<model_id>"` and the `pytest` run **fails** — the implementer must then choose the fallback and rerun until the gate is green.

The sentinel file is **gitignored**; CI relies on the gate being green locally before this section is merged.

### Step 3 — `models/grounding_dino.py`

Stub signature:

```python
class GroundingDinoClient:
    """Loads Grounding DINO 1.5 Edge via ONNX-Runtime CoreML EP on Apple
    Silicon. Falls back to YOLO-World-S int8 or OWLv2-Base ONNX if the
    spike sentinel marks gdino as failed."""

    async def detect(
        self,
        rgb: NDArray[np.uint8],
        prompts: list[str],
        score_thr: float,
    ) -> list[RawDetection]:
        ...
```

- Image encoder via ONNX-Runtime CoreML EP at 768 px input.
- Text encoder via the bundled BERT (CoreML or CPU fallback — measured by spike).
- Output normalised into `RawDetection` records with `detector="gdino"`, `frame_id` set by the caller (the op), `raw_confidence = model_score`, `label = prompt_string_used`.

Loaded once at sidecar startup and warmed up on the synthetic 1×1 black image (warm-up is wired in section-01; this section just registers the loader callback).

### Step 4 — `models/effsam.py`

Stub signature:

```python
class EffSamClient:
    """Loads EfficientSAM-Ti. Returns RLE-encoded masks per box.
    Falls back to MobileSAM if the spike sentinel marks effsam as failed."""

    async def segment(
        self,
        rgb: NDArray[np.uint8],
        boxes: list[BBox],
    ) -> list[Optional[Mask]]:
        ...
```

Note from §3.7: the prompt-encoder runs **once per box, not per frame**. End-to-end timing from the spike must be honoured here — the implementation is allowed to batch box-prompts to amortise encoder cost as long as the per-30-box scene latency stays under 2 s.

### Step 5 — `ops/grounding_dino_detect.py`

Op contract (from §3.5):

- **Input:** `list[Frame]`, `PromptList` (from `vlm_prompt_expansion`).
- **Output:** `list[FrameDetections(detector="gdino", frame_id=..., detections=...)]`.
- For each frame and each prompt, emit detections above `config.thresholds.gdino_score_thr` (default 0.30). `RawDetection.label = prompt_text`, `raw_confidence = model_score`.
- Per-frame retry 3×; final fail per frame → `FrameDetections(detector_error=True, detections=[])`.
- Empty `PromptList.prompts` → emit one `FrameDetections(detections=[])` per frame, `detector_error=False`.

Determinism: prompts iterated in input list order; detections sorted by `(frame_id, label, x, y)` before emission so replay tests are byte-stable.

### Step 6 — `ops/sahi_recovery.py`

Op contract (from §3.6):

- **Input:** `list[Frame]`, `list[FrameDetections]` (per-detector output of florence_detect + grounding_dino_detect).
- **Output:** **conditional** — for each frame whose first-pass density `< sahi_trigger_density`, emit one additional `FrameDetections(detector="gdino-sahi", frame_id=..., detections=..., tile_errors=...)`. For frames at or above the trigger, **emit nothing** for that frame (skip — different from "empty").
- Tile each triggered frame into 512 × 512 windows with **64-px overlap**.
- Re-run gdino on each tile against the same `PromptList`.
- Re-project tile-local boxes to full-frame coordinates: `x_full = x_tile + tile_origin_x`, `y_full = y_tile + tile_origin_y`.
- IoU-filter against first-pass boxes from any detector — drop tile-detections whose IoU with any first-pass box of the same primary label > 0.5.
- Per-tile retry 3×. Persistent tile failures → `tile_errors.append(TileError(tile_index, code, message))`. The op itself still succeeds.
- If `len(tile_errors) / total_tiles > 0.5` for a frame, set `tile_errors[0].code` carries a sentinel for `agreement_scoring` (section-07) to flag a run-level warning. The mechanism: a `tile_errors` list with > 50% failure population is itself the signal — `agreement_scoring` does the elevation, not this op.

Determinism: tile order is deterministic (row-major from `(0, 0)` outward). All gdino calls inside SAHI go through the same `GroundingDinoClient` instance — the per-model semaphore in `models/ollama_client.py` does NOT apply here (gdino is not on Ollama), but a separate per-client lock prevents contention with the first-pass `grounding_dino_detect` op.

### Step 7 — `ops/effsam_segment.py`

Op contract (from §3.7):

- **Input:** `list[Frame]`, `FusedFrame[]` (depends on `box_fusion` — see section-06). For now, `effsam_segment` accepts the in-graph upstream output type from section-06; section-05 implements the op against the typed upstream signature even though section-06 hasn't shipped yet.
- **Output:** per-detection `Optional[Mask]` (RLE-encoded bytes) populated back onto the `FusedFrame.detections`.
- Drop masks with IoU < 0.4 against the input box — likely occlusion bleed.
- If `EffSamClient` is unavailable (or spike-degraded to `None`), the op succeeds with **empty masks**; downstream `crop_embedding` (section-04, already shipped) falls back to bbox crop. This pathway must be exercised by a unit test.
- Per-box failure does not abort the op; the failed box's `mask` is `None`.

### Step 8 — fallback wiring

Each model client checks the spike sentinel at construction time:

```python
def __init__(self) -> None:
    sentinel = _read_spike_sentinel()
    if sentinel and not sentinel["gdino"]["passed"]:
        self._impl = _load_fallback(sentinel["gdino"]["fallback"])
    else:
        self._impl = _load_primary()
```

Fallbacks (from §11.1):

| Primary | Fallback options |
| --- | --- |
| Grounding DINO 1.5 Edge | OWLv2-Base ONNX (CoreML EP) **or** YOLO-World-S int8 |
| EfficientSAM-Ti | MobileSAM |
| DINOv2 ViT-B/14 (already shipped in §04) | DINOv2 ViT-S/14 (drops typed dim 768→384 — not in this section's scope; flagged for §04 follow-up if encountered) |

Fallback model output shapes are normalised to the same `RawDetection` / `Mask` types so no caller of these ops can tell which model is loaded.

### Step 9 — log-redaction wiring

Both new ops emit detection results that include `label` strings — these come from VLM prompt expansion (§3.3) and may contain PII-derived nouns. The log-redaction filter (already wired in section-01 via `log_redaction.py`) is invoked by these ops via `logger.info("...", extra={"_redact": True, ...})`. Verify with `caplog` in unit tests that no full label list lands in log records — only `len, sample_first_3=[...]`.

### Step 10 — replay fixtures

Capture three op-replay fixtures via the existing replay-test infrastructure (section-01). Each fixture is golden JSON I/O for one op invocation:

- `grounding_dino_detect_basic.json` — 1 frame, 5 prompts, deterministic mock model client, ~3 detections.
- `sahi_recovery_triggered.json` — 1 frame at sub-threshold density, deterministic mock returning predictable tile detections.
- `effsam_segment_basic.json` — 3 boxes, deterministic mock returning known RLE masks.

These fixtures are **byte-equal regression** anchors. Refresh is a separate PR (per §3.0 replay rules).

---

## Done checklist

- [ ] Spike fixtures committed under `tests/fixtures/spike/rooms/` (5 PII-clean WebPs, ≥ 8 objects each).
- [ ] `make spike` passes locally on the developer Mac with `.spike-gate.json` showing all criteria met (or fallbacks chosen and re-passing).
- [ ] `models/grounding_dino.py` and `models/effsam.py` ship with both primary and fallback paths, sentinel-driven.
- [ ] `ops/grounding_dino_detect.py` honours empty-`PromptList`, per-frame retry, deterministic ordering, `detector="gdino"` field.
- [ ] `ops/sahi_recovery.py` honours density-gating (trigger only when below threshold), correct re-projection, IoU filtering against first-pass, `tile_errors` accumulation, `detector="gdino-sahi"` field.
- [ ] `ops/effsam_segment.py` honours IoU < 0.4 mask drop, unavailable-EffSAM degraded path, per-box failure isolation.
- [ ] All unit tests in this section's "Tests FIRST" list pass.
- [ ] Three replay fixtures committed; replay tests pass byte-equal.
- [ ] Cross-cutting op-concerns tests (deterministic ordering, empty-set 0.0, log redaction) extended to these three ops and pass.
- [ ] Total stack ceiling check (≤ 6 GB RSS with all models warm) verified on the developer Mac at sign-off.
- [ ] `make eval` (still ungated until section-09's corpus exists) runs end-to-end without raising — section-04's prompt expansion now feeds gdino, gdino feeds SAHI when triggered, EffSAM produces masks for downstream crop_embedding. Section-06 (`box_fusion`) is not yet wired; this section's ops emit their typed outputs and section-06 will consume them.
- [ ] No contract changes leaked into `pipeline_service/types.py`. The fallback path produces byte-equal `FrameDetections` / `Mask` shapes.

Relevant absolute paths:
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/pipeline_service/models/grounding_dino.py`
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/pipeline_service/models/effsam.py`
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/pipeline_service/ops/grounding_dino_detect.py`
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/pipeline_service/ops/sahi_recovery.py`
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/pipeline_service/ops/effsam_segment.py`
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/tests/integration/test_gdino_apple_silicon_spike.py`
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/tests/integration/test_effsam_apple_silicon_spike.py`
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/tests/integration/test_spike_gate.py`
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/tests/unit/ops/test_grounding_dino_detect.py`
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/tests/unit/ops/test_sahi_recovery.py`
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/tests/unit/ops/test_effsam_segment.py`
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/tests/replay/fixtures/grounding_dino_detect_basic.json`
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/tests/replay/fixtures/sahi_recovery_triggered.json`
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/tests/replay/fixtures/effsam_segment_basic.json`