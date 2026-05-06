I now have all the context needed to write section-04. Let me generate the content.

# section-04-embedding-and-prompt

## Status / dependencies

- **Depends on:** section-03 (legacy-equivalent ops — `florence_detect` and `classification_refine` already wired through Dagster, Ollama single-flight semaphore in place in `pipeline_service/models/ollama_client.py`).
- **Blocks:** section-05 (gdino/SAHI/EffSAM consume the prompt list and crop embeddings produced here), section-06 (fusion uses the embeddings produced here for cross-pass / cross-frame dedup).
- **Test command (for this section):** `cd pipeline-service && uv run pytest`.
- **Determinism rule:** every model call in tests is mocked. No live HTTP to Ollama / DINOv2 / Florence in unit or integration suites.

## Goal

Add the embedding + prompt plumbing layer of the pipeline:

1. `scene_embedding` op — DINOv2 ViT-B/14 (768-d float16) per frame via MLX, used as the cache key for prompt expansion and to detect non-blank scenes during agreement scoring downstream.
2. `vlm_prompt_expansion` op — two-seed prompt generation (Qwen-VL + Florence captions) with a scene-embedding-keyed cache and an explicit cache-bypass on `embedding_failed` (regression for the zero-vector collision bug).
3. `crop_embedding` op — DINOv2 ViT-B/14 per fused box, L2-normalised float16 server-side, **int8-quantised** before being shipped to the device (768 B/vector instead of 1.5 KB).
4. Supporting infrastructure: `models/dinov2.py` loader (MLX port), `storage/prompt_cache.py` (with bypass path).

After this section ships, the Dagster DAG runs `frame_intake → scene_embedding → vlm_prompt_expansion → florence_detect (already from section-03)` and produces `EmbeddedFrame`s ready for fusion. The grounded-detector and fusion ops (sections 5 + 6) consume these outputs.

## Background context (self-contained)

### 0.1 Pipeline shape (only the parts this section touches)

```
frame_intake (list of frames)              [section-01, exists]
    └─> scene_embedding                    [THIS SECTION 3.2]
         └─> vlm_prompt_expansion          [THIS SECTION 3.3]
              └─> grounding_dino_detect    [section-05, downstream]
    └─> florence_detect                    [section-03, exists]
         └─> box_fusion                    [section-06, downstream]
              └─> crop_embedding           [THIS SECTION 3.9]
                   └─> cross_pass_dedup    [section-06, downstream]
```

`vlm_prompt_expansion` reads frames + scene embeddings; section-03 already exposes a Florence client whose captions feed the second seed. `crop_embedding` runs **after** `box_fusion` and feeds dedup ops in section-06.

### 0.2 Cross-cutting op concerns (apply to every op in this section)

- **Empty-set semantics.** Every op defines its behaviour for empty inputs. Coverage / precision over an empty set are `0.0`, never NaN. Concrete cases:
  - `scene_embedding([])` → `[]`.
  - `vlm_prompt_expansion([], [])` → `PromptList(prompts=[], cached=False, source_models=[], degraded=True)`.
  - `crop_embedding(frame, FusedFrame(fused=[]))` → `EmbeddedFrame(frame_id, embeddings={})`.
- **Deterministic ordering.** Inputs are sorted by stable keys before processing — never rely on dict / set iteration order. `crop_embedding` sorts detections lexicographically by `detection_id` so embedding lookup is reproducible. `vlm_prompt_expansion` sorts the deduped prompt list before returning.
- **Replay tests.** Replay = pytest replay against golden JSON I/O fixtures under `pipeline-service/tests/replay/fixtures/`. Each op in this section ships at least one replay fixture: `scene_embedding_happy_path.json`, `prompt_expansion_cache_hit.json`, `prompt_expansion_cache_bypass.json`, `crop_embedding_3box.json`. Re-invoking the op on the recorded input must produce byte-equal output.
- **Ollama serialisation.** All Ollama calls in `vlm_prompt_expansion` go through `models/ollama_client.py` (already exists from section-03), which holds a per-model `asyncio.Semaphore(1)`. This op MUST NOT bypass that path.
- **Log redaction.** `vlm_prompt_expansion.PromptList` is a structured-log redaction target. The op logs prompt lists via `logger.info(..., extra={"_redact": True, "prompt_count": N, "sample_first_3": [...]})`; the formatter in `pipeline_service/log_redaction.py` (already exists from section-01) renders only `len(prompts)=N, sample_first_3=[lowercased noun heads only]`. Full content is available via Dagster asset metadata (local Mac), not Loki.

## Files to create / modify

```
pipeline-service/
├── pipeline_service/
│   ├── ops/
│   │   ├── scene_embedding.py            # NEW
│   │   ├── vlm_prompt_expansion.py       # NEW
│   │   └── crop_embedding.py             # NEW
│   ├── models/
│   │   ├── dinov2.py                     # NEW — DINOv2 ViT-B/14 (768-d) via MLX
│   │   └── ollama_client.py              # EXTEND (re-use; no new client class)
│   ├── storage/
│   │   └── prompt_cache.py               # NEW — embedding-keyed cache + bypass path
│   ├── dagster_defs.py                   # UPDATE — register new ops
│   └── types.py                          # UPDATE — add SceneEmbedding, PromptList,
│                                              EmbeddedFrame if not already present
└── tests/
    ├── unit/
    │   └── ops/
    │       ├── test_scene_embedding.py     # NEW
    │       ├── test_vlm_prompt_expansion.py # NEW
    │       └── test_crop_embedding.py       # NEW
    └── replay/
        └── fixtures/
            ├── scene_embedding_happy_path.json     # NEW
            ├── prompt_expansion_cache_hit.json     # NEW
            ├── prompt_expansion_cache_bypass.json  # NEW
            └── crop_embedding_3box.json            # NEW
```

`pipeline_service/types.py` already contains `Frame` and `FusedFrame` from earlier sections; this section adds `SceneEmbedding`, `PromptList`, `EmbeddedFrame` only if they are not already declared.

## TDD — tests to write FIRST

> Stubs only — write the assertions, fixtures, and mocks yourself. Every model call is mocked.

### Test file 1 — `pipeline-service/tests/unit/ops/test_scene_embedding.py`

```python
"""Tests for scene_embedding op.

Mocks pipeline_service.models.dinov2.DinoV2Embedder. No live model calls."""

# Test: returns 768-d float16 L2-normalised vector per frame on happy path
#       (mock dinov2 model returns a known vector; assert shape, dtype, ||v||==1)
# Test: retries 3× on model exception (mock raises twice, succeeds third time);
#       assert vector returned, retry_count==2 visible in op metadata
# Test: 3 retries all fail → returns SceneEmbedding(embedding_failed=True,
#       vector=zero_vector_768_f16). Op succeeds; pipeline continues.
# Test: zero-vector flag does NOT collide with real-vector hashes —
#       hash(zero_vec) != hash(any_real_vec_in_fixture_set). Asserts
#       vlm_prompt_expansion's bypass logic isn't fooled.
# Test: per-frame independence — failure of one frame does not abort others
#       (mock raises for frame 1 only; frames 0 + 2 produce real vectors,
#       frame 1 has embedding_failed=True)
# Test: vector dim of 768 is asserted at runtime in the op itself
#       (catches the ViT-S/14-vs-ViT-B/14 swap risk — if a fallback
#       loader returns 384-d, op raises a clear DimMismatchError)
# Test: input crop is the centre-square 224×224 of each frame
#       (assert the mock was called with a tensor of shape (1, 3, 224, 224))
# Test: empty input list → returns []
```

### Test file 2 — `pipeline-service/tests/unit/ops/test_vlm_prompt_expansion.py`

```python
"""Tests for vlm_prompt_expansion op.

Mocks ollama_client.OllamaClient.chat AND florence_client.detect.
Uses a fixture PromptCache with controllable hits/misses."""

# Test: cache hit returns cached PromptList with cached=True, source_models
#       reflects what was cached, no live model calls made
# Test: cache miss runs BOTH seeds (Qwen + Florence) in parallel and returns
#       the union (deduplicated). source_models=['qwen2.5vl:7b', 'florence-2'].
#       cached=False.
# Test: when ANY frame has embedding_failed=True, the cache is BYPASSED entirely
#       — mock cache asserts no .get() is called, both seeds run live.
#       (REGRESSION TEST for the zero-vector collision bug — without bypass,
#       all failed scenes alias onto the same cached prompt list.)
# Test: prompt list is sanitised — split on lines, trimmed, lowercased,
#       deduped, drops empties, drops items > N tokens (default N tokens
#       in config), capped at top M (default M=80)
# Test: Qwen seed fails (3× retry) but Florence seed succeeds → returns
#       Florence-only prompt list, source_models=['florence-2'], degraded=False
# Test: Florence seed fails but Qwen seed succeeds → Qwen-only,
#       source_models=['qwen2.5vl:7b'], degraded=False
# Test: BOTH seeds fail → returns PromptList(prompts=[], degraded=True);
#       op SUCCEEDS (downstream agreement_scoring catches single_source_run)
# Test: cache key is hash(round(median_scene_embedding, 3 dp)) —
#       similar embeddings (within 1e-3) hit same key; vectors differing
#       at 4th decimal place hit different keys
# Test: median scene embedding is selected by minimum sum-of-distances to
#       all other frame embeddings (NOT arbitrary frame[0])
# Test: parse failure on Qwen response retries 3× per seed then degrades;
#       Florence-side parse failure same path
# Test: log redaction — capture logs through caplog; assert no full prompt
#       text appears, only "prompt_count=N, sample_first_3=[...]"
# Test: Ollama semaphore is honoured — N=4 concurrent calls to the op all
#       go through the same per-model semaphore in ollama_client (asserts
#       only one Qwen request in flight at a time; the test spies on
#       OllamaClient.chat call concurrency)
# Test: empty frame list → PromptList(prompts=[], cached=False,
#       source_models=[], degraded=True)
```

### Test file 3 — `pipeline-service/tests/unit/ops/test_crop_embedding.py`

```python
"""Tests for crop_embedding op.

Mocks pipeline_service.models.dinov2.DinoV2Embedder. No live model calls."""

# Test: emits 768-d float16 L2-normalised vector per box (pre-quantisation,
#       inspect via op's internal metadata or expose for test)
# Test: int8 quantisation reduces vector to exactly 768 bytes;
#       cosine(dequantised_int8, original_f16) ≥ 0.99
# Test: uses EfficientSAM mask edge if mask exists on the FusedDetection,
#       else uses bbox (assert the cropping helper was called with a mask
#       region in the first case, bbox in the second)
# Test: per-crop retry (3×) on model exception; assert success on retry 3
# Test: persistent crop failure (3 retries exhausted) flags detection
#       embedding_unavailable=True; the detection is still emitted but
#       its detection_id is NOT in EmbeddedFrame.embeddings dict
# Test: crops are sorted by detection_id lexicographically before being
#       embedded (deterministic ordering; replay test would catch this)
# Test: empty FusedFrame.fused → EmbeddedFrame(frame_id, embeddings={})
# Test: input crop resized to 224×224 before DinoV2 call (assert mock
#       was called with the right shape)
# Test: cropping respects EXIF-stripped frame coordinates (no
#       orientation surprise)
# Test: int8 quant produces deterministic byte output for the same
#       float16 input (replay test invariant)
```

### Replay fixtures (committed JSON)

`pipeline-service/tests/replay/fixtures/`:

- `scene_embedding_happy_path.json` — input: 3 frames (synthetic deterministic RGB tensors); output: 3 SceneEmbedding records. Re-invoking the op with the recorded input produces byte-equal output (mock the DinoV2 model with a deterministic stub so the replay is reproducible).
- `prompt_expansion_cache_hit.json` — input: 3 frames + 3 valid SceneEmbeddings whose median round-3dp hash already exists in the test cache. Output: cached PromptList (cached=True, no live model calls). The fixture pre-populates the cache from a separate setup field so the replay is hermetic.
- `prompt_expansion_cache_bypass.json` — input: 3 frames + 3 SceneEmbeddings where one has `embedding_failed=True`. Output: PromptList from live (mocked) Qwen+Florence seeds; cache .get() must NOT have been called.
- `crop_embedding_3box.json` — input: 1 frame + FusedFrame with 3 fused detections (one with mask, two with bbox-only). Output: EmbeddedFrame with 3 entries; byte-equal int8 quantisation guaranteed by deterministic mock embedder.

## Implementation details (op-by-op contracts)

> Bodies are NOT specified. Only contracts, behaviour rules, and failure semantics are defined. The implementer writes the bodies after writing the failing tests.

### 3.2 `scene_embedding`

**File:** `pipeline-service/pipeline_service/ops/scene_embedding.py`

**Signature (Dagster op):**

```python
@op(
    ins={"frames": In(list[Frame])},
    out=Out(list[SceneEmbedding]),
    retry_policy=RetryPolicy(max_retries=3, delay=1.0, backoff=Backoff.EXPONENTIAL),
)
def scene_embedding(context, frames: list[Frame]) -> list[SceneEmbedding]:
    """Embed each frame's centre-square 224×224 crop with DINOv2 ViT-B/14.

    Output vectors are float16, L2-normalised. On 3-retry failure for a
    frame, emits SceneEmbedding(vector=zero_vector_768_f16,
    embedding_failed=True). Per-frame failures are independent."""
```

**Behaviour:**

1. For each frame: extract centre-square 224×224 crop from `frame.rgb`. (Helper: small util in the op file or in `models/dinov2.py`.)
2. Call `DinoV2Embedder.embed(crop)` via the loader in `pipeline_service/models/dinov2.py` (MLX port on Apple Silicon; CPU fallback acceptable).
3. Output is L2-normalised float16, shape `(768,)`. **Assert dim == 768 at runtime** — raise `DimMismatchError` (a clear named exception, not a generic `AssertionError`) if a fallback loader silently returned 384-d. This is the regression for §11.1's ViT-S/14 fallback.
4. Per-frame retry: 3× with exponential backoff. On final failure for a single frame, emit `SceneEmbedding(frame_id=frame.frame_id, vector=np.zeros(768, dtype=np.float16), embedded_at=now(), embedding_failed=True)`.
5. Per-frame independence: a single frame's failure does not abort siblings.
6. Empty input → `[]`.

**Type:** add to `pipeline_service/types.py` if not already present:

```python
class SceneEmbedding(BaseModel):
    frame_id: FrameId
    vector: NDArray[np.float16]   # shape (768,)
    embedded_at: datetime
    embedding_failed: bool = False
```

### 3.3 `vlm_prompt_expansion`

**File:** `pipeline-service/pipeline_service/ops/vlm_prompt_expansion.py`

**Signature:**

```python
@op(
    ins={"frames": In(list[Frame]),
         "scene_embeddings": In(list[SceneEmbedding])},
    out=Out(PromptList),
)
async def vlm_prompt_expansion(
    context, frames: list[Frame], scene_embeddings: list[SceneEmbedding]
) -> PromptList:
    """Two-seed prompt expansion (Qwen + Florence captions) with
    scene-embedding-keyed cache; bypasses cache when ANY embedding failed."""
```

**Behaviour:**

1. **Bypass path.** If `any(se.embedding_failed for se in scene_embeddings)`, skip cache lookup entirely. Run both seeds live. Reason: hashing zero-vectors would collide all failed scenes onto a single cached prompt list and poison every subsequent run.
2. **Cache lookup.** Otherwise compute the median scene embedding (the frame whose embedding has minimum sum-of-distances to all others; tie-break on `frame_id`), round each component to 3 decimal places, hash with `hashlib.sha256`, look up `pipeline_service.storage.prompt_cache.PromptCache.get(key)`. On hit, return the cached `PromptList` with `cached=True`.
3. **Cache miss — two parallel seeds:**
   - **Seed A (Qwen):** call `OllamaClient.chat(model='qwen2.5vl:7b', prompt=PROMPT_TEMPLATE, image=median_frame_rgb)` where `PROMPT_TEMPLATE` is the literal:
     > "Look at this room photo. List every kind of household object that is visible OR likely to be visible in similar photos. Return one noun-phrase per line, lowercase, no commentary."
   - **Seed B (Florence captions):** read the captions emitted by `florence_detect` for the same frames (passed in via Dagster asset linkage from section-03's florence op output) — flat noun list, no LLM involvement.
   - Run A and B concurrently with `asyncio.gather(..., return_exceptions=True)`. Merge: union, deduplicated.
4. **Sanitise** the merged list:
   - Split on newlines.
   - Trim whitespace.
   - Lowercase.
   - Drop empties.
   - Drop items > N tokens (default N=4 tokens; pull from `config.thresholds`).
   - Deduplicate.
   - Sort lexicographically (determinism for replay).
   - Cap to top M (default M=80).
5. **Cache write** keyed by `hash(round(median_scene_embedding, 3 dp))`. Cache value is the full `PromptList(cached=False)` so cache hits can flip `cached=True` without re-running.
6. **Failure paths:**
   - Qwen 3× fail / parse-error → log + skip Seed A; if Florence succeeded, return Florence-only PromptList (`source_models=['florence-2']`, `degraded=False`).
   - Florence 3× fail → if Qwen succeeded, return Qwen-only (`source_models=['qwen2.5vl:7b']`, `degraded=False`).
   - **Both seeds fail** → emit `PromptList(prompts=[], cached=False, source_models=[], degraded=True)`. Op SUCCEEDS — downstream `agreement_scoring` (section-07) flags the run as `single_source_run`.
7. **Ollama serialisation.** Calls go through the existing `models/ollama_client.py` (per-model `asyncio.Semaphore(1)`). Do NOT instantiate a fresh client; reuse the section-03 singleton.
8. **Logging.** Use the redacted-log pattern: `logger.info("prompt expansion done", extra={"_redact": True, "prompt_count": len(prompts), "sample_first_3": [p for p in prompts[:3]], "source_models": source_models, "cached": cached})`. The `log_redaction` formatter (already wired in section-01) renders only the structural shape.

**Type:** add to `types.py`:

```python
class PromptList(BaseModel):
    prompts: list[str]
    cached: bool
    source_models: list[str]      # subset of {'qwen2.5vl:7b', 'florence-2'}
    degraded: bool                # True iff both seeds failed
```

### 3.9 `crop_embedding`

**File:** `pipeline-service/pipeline_service/ops/crop_embedding.py`

**Signature:**

```python
@op(
    ins={"frame": In(Frame),
         "fused_frame": In(FusedFrame)},
    out=Out(EmbeddedFrame),
    retry_policy=RetryPolicy(max_retries=3, delay=0.5, backoff=Backoff.EXPONENTIAL),
)
def crop_embedding(context, frame: Frame, fused_frame: FusedFrame) -> EmbeddedFrame:
    """Crop each fused box (mask edge if available, else bbox), resize to
    224×224, embed via DINOv2 ViT-B/14 (768-d float16 L2-normalised),
    then quantise to int8 (768 bytes per vector) for on-device storage."""
```

**Behaviour:**

1. Sort `fused_frame.detections` by `detection_id` lexicographically before processing (determinism guarantee for replay).
2. For each detection:
   - If detection has a mask (mask data populated in section-05's `effsam_segment` output and propagated through fusion), use mask-edge crop. Else use bbox crop. (Helper: small `_extract_crop(frame.rgb, detection)` util in the op file.)
   - Pad to square, resize to 224×224.
   - Call `DinoV2Embedder.embed(crop)` → 768-d float16 L2-normalised.
   - **Quantise to int8.** Use a deterministic affine quantisation (e.g., `int8 = round(f16 * 127)` for L2-normalised inputs in `[-1, 1]`); confirm in tests that `cosine(dequant(int8), original_f16) ≥ 0.99`. Output is exactly **768 bytes per vector**.
3. Per-crop retry: 3× with exponential backoff. On final failure for a single crop, the detection is flagged `embedding_unavailable=True` (added to the FusedDetection or carried in EmbeddedFrame side-channel — implementer's call, but the test asserts the missing detection_id is NOT in `EmbeddedFrame.embeddings`). The detection still passes through downstream; section-06's `cross_frame_dedup` excludes embedding-unavailable detections from FAISS.
4. Empty `FusedFrame.fused` → `EmbeddedFrame(frame_id=frame.frame_id, embeddings={})`.
5. Float16 vs int8: server-side keeps float16 for `cross_pass_dedup` / `cross_frame_dedup` math precision; **only the int8 quantised form is shipped to mobile** (in `assemble_result`'s output to Fastify). EmbeddedFrame may carry both representations or just the float16 with quantisation deferred to `assemble_result` — implementer's call, but the test asserts the int8 form exists somewhere in the output pipeline by the time it reaches `assemble_result`.

**Type:** add to `types.py`:

```python
class EmbeddedFrame(BaseModel):
    frame_id: FrameId
    embeddings: dict[DetectionId, NDArray[np.float16]]  # 768-d server-side
    # int8-quantised form computed at the op boundary or in assemble_result
```

### Supporting infrastructure

#### `pipeline_service/models/dinov2.py`

DINOv2 ViT-B/14 loader using the official MLX port. Singleton instance loaded once at sidecar startup (warm-up forward pass on a synthetic 1×1 black image is already wired in section-01's bootstrap; this section's job is to make `DinoV2Embedder` the loader the warm-up calls).

```python
class DinoV2Embedder:
    """DINOv2 ViT-B/14 (768-d) via MLX on Apple Silicon.

    Singleton — instantiated at sidecar startup, used by both
    scene_embedding and crop_embedding ops."""

    def __init__(self, model_path: str | None = None) -> None: ...

    def embed(self, image_224: NDArray[np.uint8]) -> NDArray[np.float16]:
        """Embed a 224×224×3 uint8 image. Returns L2-normalised float16
        vector of shape (768,). Asserts dim==768 before returning."""
```

Per §11.1, this is on the **highest-risk** model list. If the MLX port fails the spike acceptance criteria, fallback is `DINOv2 ViT-S/14` (384-d). **In the fallback case, both `pipeline.ts` and `types.py` have to flip the typed dim back to 384.** This section's contract says 768; the fallback is a section-level config change handled in section-05's spike work.

#### `pipeline_service/storage/prompt_cache.py`

Cache of `vlm_prompt_expansion` outputs, keyed by `hash(round(median_scene_embedding, 3 dp))`.

```python
class PromptCache:
    """Embedding-hash-keyed cache of PromptList outputs.

    BYPASSED at the call site (vlm_prompt_expansion) when any input
    SceneEmbedding has embedding_failed=True. The bypass logic lives in
    the OP, not the cache — this class has no opinion about
    embedding_failed; it just stores by key."""

    def get(self, key: str) -> PromptList | None: ...
    def set(self, key: str, value: PromptList) -> None: ...
```

In-process dict-backed for v1 (no persistence requirement). Bound size: LRU with `max_entries=10_000` (configurable). Tests inject a fresh `PromptCache` per test.

### `dagster_defs.py` updates

Register the three new ops with the existing `Definitions(...)`. The Dagster job graph should reflect the linkage:

```
frame_intake ─┬─> scene_embedding ──> vlm_prompt_expansion
              └─> florence_detect (existing) ──> vlm_prompt_expansion
                                          └─> (consumed downstream by section-05)
              └─> (downstream sections wire box_fusion → crop_embedding)
```

`vlm_prompt_expansion` takes both `frames` and `scene_embeddings` AND uses Florence's captions for Seed B — wire the Florence output as an additional asset dep so Dagster's lineage shows the prompt expansion's two upstream sources.

`crop_embedding`'s position in the graph is post-`box_fusion` (section-06). For this section, ship the op with stub upstream (`box_fusion` is still a pass-through stub from section-01); the op should run end-to-end once section-06 ships, with no contract change here.

## "Done" checklist

- [ ] All three test files written FIRST and failing.
- [ ] All four replay fixtures committed under `tests/replay/fixtures/`.
- [ ] `scene_embedding` op implemented; tests pass; runtime dim assertion catches a 384-d swap.
- [ ] `vlm_prompt_expansion` op implemented; cache hit / miss / **bypass** all tested; both-seeds-fail path tested; log redaction verified via caplog.
- [ ] `crop_embedding` op implemented; int8 quantisation produces 768-byte output with cosine ≥ 0.99 against float16; embedding-unavailable path tested.
- [ ] `models/dinov2.py` singleton loader wired to the section-01 warm-up bootstrap (warm-up calls a synthetic 1×1 black-image embed before sidecar reports ready).
- [ ] `storage/prompt_cache.py` implemented with LRU bound; bypass logic lives in the op (NOT the cache).
- [ ] `dagster_defs.py` registers the three ops; lineage in the Dagster UI shows `frame_intake → scene_embedding → vlm_prompt_expansion`, with Florence captions as a second upstream of `vlm_prompt_expansion`.
- [ ] `pipeline_service/types.py` includes `SceneEmbedding`, `PromptList`, `EmbeddedFrame` Pydantic types.
- [ ] `cd pipeline-service && uv run pytest` is green.
- [ ] Replay tests pass — re-running each op on its golden input produces byte-equal output.
- [ ] No live HTTP to Ollama / DINOv2 / Florence in any unit or integration test (only `make eval` against the local corpus, which is section-09's job).

## Risks specific to this section

- **DINOv2 dimension swap (§11.1).** Spike for the model loader runs in section-05; section-04 commits to the 768-d contract. If the spike falls back to ViT-S/14 (384-d), this section's tests will fail their dim assertions and the type definitions in `types.py` (and `pipeline.ts` mirror) will need to flip to 384. This is **not** silent — the runtime `DimMismatchError` is the trip-wire.
- **Cache poisoning regression.** The bypass-on-`embedding_failed` test is the regression for the original zero-vector collision bug. Removing it is forbidden. The bypass logic lives in the OP, not in the cache class — verify the op test that asserts `cache.get` is NOT called when any embedding failed.
- **Prompt expansion non-determinism.** Even at low temperature, Qwen output drifts across model restarts. The replay tests pin behaviour by mocking the Ollama client deterministically; the cache makes production behaviour reproducible across captures of the same scene. Do NOT rely on Qwen reproducibility for live runs.
- **Florence-as-second-seed circularity (review §2b).** This is the whole reason the seed is two-source. Do NOT collapse to Qwen-only "for simplicity" — the test enforces that on a cache miss, both clients are invoked.