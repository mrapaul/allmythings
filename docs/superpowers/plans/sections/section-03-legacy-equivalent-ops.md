Now I have all I need. Let me also check if there's content about `models/ollama_client.py` and §3.0 ollama semaphore details for context that section-03 needs.

I now have enough context to produce the section. Let me generate the content.

# section-03-legacy-equivalent-ops

## Goal

Implement the first two real ops in the Dagster DAG so that the pipeline-service produces results equivalent to today's Temporal path on a single Florence + Qwen tier chain:

1. `florence_detect` — HTTP shim of the existing `detection-service/`
2. `classification_refine` — Qwen-VL tier chain ported from the current Temporal worker

Plus the supporting `models/ollama_client.py` with a per-model `asyncio.Semaphore(1)` (the Ollama single-flight semaphore that §3.0 mandates and that `classification_refine` depends on).

End-of-section criterion: side-by-side regression on a tiny shared corpus shows the **same set of primary labels per scene at IoU ≥ 0.5 and roughly equivalent count** between the new Dagster path and today's Temporal path. This is *not* metric parity — Temporal's `EnrichedItem` lacks `contributingSignals`, so coverage/precision are not comparable.

---

## Dependencies (reference only)

- **section-01-pipeline-skeleton** — provides the FastAPI sidecar, Dagster `Definitions`, in-process `materialize()`, idempotency, 503 backpressure, model-warm-up hooks, log-redaction infrastructure, `frame_intake` and `assemble_result` ops, and the Pydantic types in `pipeline_service/types.py` (mirror of the TS types in §5.1). All middle ops in section-01 are typed pass-through stubs; this section replaces two of those stubs (`florence_detect`, `classification_refine`) with real implementations.
- **section-02-fastify-pipeline-client** — gives the Fastify-side `pipeline.client.ts` and `USE_PIPELINE_SERVICE` feature flag so the side-by-side regression has a real consumer. Not strictly required to ship section-03's unit tests, but required for the regression check at the end.

---

## Background context (self-contained)

### Why this section exists in the cutover plan

This is **Phase 3** of the cutover. The order is: Phase 1 skeleton → Phase 2 wire Fastify → **Phase 3 legacy-equivalent ops** → Phase 4a/b/c/d new ops → Phase 6 mobile rewrite → Phase 5 delete Temporal. Phase 3 must produce a Dagster path that matches the current Temporal path on the only two model calls today's pipeline makes (Florence-2 + the Qwen-VL tier chain). After this section ships, every later section adds capability *on top of* a known-good baseline.

### Architecture reminders relevant to this section

- The `pipeline-service/` is a Python FastAPI sidecar that imports Dagster `Definitions` and runs jobs via `materialize()` in-process. There is **no Dagster daemon**.
- Concurrent in-process runs are gated by an `asyncio.Semaphore` (default 1) at the sidecar level (section-01 territory).
- All Ollama calls go through `models/ollama_client.py` which holds a **per-model** `asyncio.Semaphore(1)`. This eats parallelism intentionally — Ollama serialises on a single Mac GPU anyway, and the semaphore prevents memory thrash from concurrent model swaps.
- Florence-2 is served by the **existing** `detection-service/` Python HTTP server (kept as-is). The `florence_detect` op is a thin HTTP client.
- Both ops are pure-ish: their only side effects are HTTP calls to local services. They emit typed Pydantic outputs that downstream ops consume.

### Cross-cutting op concerns (§3.0) that apply here

- **Empty-set semantics.** Numeric output for an empty set is `0.0`, never `NaN`. Both ops here are list-emitting, so empty input must produce empty (but well-typed) output, not raise.
- **Deterministic ordering.** Florence regions are sorted `(detector_class, frame_id, label, x, y)` — but for `florence_detect` specifically, the only stable key needed is sorting Florence regions per frame by `(label, x, y)` so output is byte-equal across runs given the same upstream input.
- **Replay tests.** "Replay" here means op-level pytest replay: golden JSON I/O fixtures under `pipeline-service/tests/replay/fixtures/`, deterministic re-invocation of the op asserting byte-equal output. Refresh of fixtures is a separate intentional PR.
- **Ollama serialisation.** Required behaviour for `classification_refine` — see `models/ollama_client.py` below.
- **Log redaction.** `classification_refine` emits VLM-derived structured attributes that may include text inferred from frame contents. Loggers must use the redaction infrastructure stood up in section-01: `logger.info("...", extra={"_redact": True, ...})`. Redactor formats only `len(attributes)=N, sample_first_3_keys=[...]`. Full content lives in Dagster asset metadata only, never in Loki.

---

## Files to create / modify

```
pipeline-service/
├── pipeline_service/
│   ├── ops/
│   │   ├── florence_detect.py           # NEW (replaces section-01 stub)
│   │   └── classification_refine.py     # NEW (replaces section-01 stub)
│   ├── models/
│   │   ├── florence_client.py           # NEW — HTTP to existing detection-service
│   │   └── ollama_client.py             # NEW — HTTP to Ollama, per-model semaphore
│   └── dagster_defs.py                  # MODIFY — register the two real ops
└── tests/
    ├── unit/
    │   ├── ops/
    │   │   ├── test_florence_detect.py          # NEW
    │   │   └── test_classification_refine.py    # NEW
    │   ├── models/
    │   │   └── test_ollama_client.py            # NEW (semaphore behaviour)
    │   └── test_op_concerns.py                  # MODIFY — add Ollama-semaphore test if not already present
    ├── integration/
    │   └── test_phase3_regression.py            # NEW — side-by-side label-set check
    └── replay/
        └── fixtures/
            ├── florence_detect/                 # NEW — golden I/O JSONs
            └── classification_refine/           # NEW — golden I/O JSONs
```

The `detection-service/` code is **not** modified — `florence_detect` is purely a client of it.

---

## Test command for this section

```
cd pipeline-service && uv run pytest tests/unit/ops/test_florence_detect.py \
                                     tests/unit/ops/test_classification_refine.py \
                                     tests/unit/models/test_ollama_client.py \
                                     tests/integration/test_phase3_regression.py
```

Followed by the full `cd pipeline-service && uv run pytest` to ensure no regressions in section-01 stubs.

---

## TESTS FIRST

Write all tests below before writing any production code. Each `# Test:` line is a *single* test case; the implementer fills in fixtures, mocks, and assertions. Do not paste these comments verbatim into production tests.

### `pipeline-service/tests/unit/ops/test_florence_detect.py`

```python
# Test: emits RawDetection with raw_confidence=None for every detection
#       (Florence emits no score; explicit absence per §5.1)
# Test: per-frame retry (3×) on HTTP 5xx; succeeds on a later attempt
# Test: per-frame final fail emits FrameDetections(detector_error=True, detections=[])
#       — does NOT abort the op for other frames in the burst
# Test: heartbeat is emitted at most every 5s during long Florence calls
#       (use a slow fake responder + clock-mock; assert heartbeat call count)
# Test: regions[].caption maps directly to RawDetection.label (lowercase
#       handling preserved as Florence emits it; no normalisation here)
# Test: detector field is "florence" on every emitted detection
# Test: bbox normalisation — Florence's {x, y, w, h} maps to BBox without
#       coordinate-system change (op assumes Florence already returns
#       full-frame pixel coordinates; document and assert)
# Test: empty regions[] from Florence → FrameDetections(detector="florence",
#       frame_id=..., detections=[], detector_error=False)
# Test: HTTP timeout configurable via config; default matches existing
#       Temporal worker's Florence timeout (sanity check, not parity gate)
# Test: deterministic output ordering — sorts emitted detections by
#       (label, x, y) so byte-equal output across runs given same Florence input
# Test: golden replay fixture under tests/replay/fixtures/florence_detect/
#       round-trips byte-equal
```

### `pipeline-service/tests/unit/ops/test_classification_refine.py`

```python
# Test: tier chain qwen2.5vl:7b → qwen2.5vl:3b → moondream → empty {}
#       on cascading failure (each tier failure type matches existing Temporal
#       worker behaviour: timeout, parse error, 5xx)
# Test: dedup'd detections (NOT raw Florence regions) drive the call list
#       — call count == len(SceneObservation.detections) on the happy path
# Test: vlmStructuredAttributes populated on success with parsed JSON dict
# Test: vlmStructuredAttributes = {} (not a fake "florence-only" default,
#       not None) when ALL tiers fail — present-without-enrichment is allowed,
#       lying with a default attribute set is not
# Test: parse failure on a tier's output → fall through to next tier
#       (non-retryable error type; matches existing Temporal behaviour —
#       parse errors are NOT retried within the same tier)
# Test: timeout on a tier → fall through to next tier (after the tier's
#       own retry budget is exhausted)
# Test: Ollama semaphore is honoured — concurrent classification_refine ops
#       across two parallel runs do not double-fire the same Qwen model
#       (use an instrumented OllamaClient fake that asserts in-flight count == 1
#       per model)
# Test: empty SceneObservation.detections → returns the SceneObservation
#       unchanged with no Ollama calls made
# Test: classificationTierForcing from PipelineConfig pins the tier
#       — when set to "qwen3b", qwen7b is skipped entirely, qwen3b runs first
# Test: log_redaction is applied — captured logs from this op show only
#       redacted shape ("len=N, sample_first_3_keys=[...]"), never raw
#       attribute values
# Test: golden replay fixture under tests/replay/fixtures/classification_refine/
#       round-trips byte-equal (mock the Ollama client to return fixture-fixed
#       responses)
```

### `pipeline-service/tests/unit/models/test_ollama_client.py`

```python
# Test: OllamaClient holds an asyncio.Semaphore(1) per model name
#       — verified by spawning N concurrent calls to model="qwen2.5vl:7b"
#       and asserting at most one is in flight at a time
# Test: different models do NOT share a semaphore — concurrent call to
#       "qwen2.5vl:7b" and one to "moondream" both proceed in parallel
# Test: semaphore is released on exception (no permanent deadlock)
# Test: HTTP 5xx triggers retry per the configured budget; 4xx does not
# Test: parse error (invalid JSON in the response) is raised as a
#       distinct exception type that classification_refine recognises as
#       "fall through to next tier", NOT "retry within tier"
# Test: timeout is configurable per call; default matches the existing
#       Temporal worker's per-tier timeouts
# Test: client honours the OLLAMA_HOST env var (defaults to
#       http://127.0.0.1:11434 — matches existing service)
```

### `pipeline-service/tests/integration/test_phase3_regression.py`

```python
# Goal: end-of-section regression check.
# Runs the partial Dagster DAG (frame_intake → florence_detect →
# classification_refine → assemble_result, with all other middle ops
# still as section-01 stubs) against a tiny shared corpus and compares
# its output against the existing Temporal path's output for the same input.
#
# The criterion is NOT metric parity. Temporal's EnrichedItem has no
# contributingSignals. The criterion is:
#
# Test: for each scene in the fixture corpus, the SET of primary_labels
#       emitted by the Dagster path matches the set emitted by Temporal
#       at IoU ≥ 0.5 between matched boxes (use Hungarian matching on IoU)
# Test: detection count per scene is "roughly equivalent" — within ±20%
#       (loose because dedup is still a section-01 stub at this point;
#        section-04+ tighten this)
# Test: the regression fixture lives at
#       pipeline-service/tests/integration/fixtures/phase3_regression/
#       and contains pre-recorded Temporal outputs (captured once, committed)
#       so the test does not require a live Temporal worker
```

---

## Implementation details

### `pipeline_service/models/ollama_client.py`

A thin async HTTP client to Ollama with a **per-model** semaphore.

Stub:

```python
class OllamaClient:
    """HTTP client to local Ollama with per-model single-flight semaphore.

    All Ollama calls in pipeline_service go through this client. The
    per-model asyncio.Semaphore(1) intentionally serialises calls to the
    same model — Ollama serialises on a single Mac GPU anyway, and this
    prevents memory thrash from concurrent model swaps.
    """

    def __init__(self, host: str = "http://127.0.0.1:11434", *,
                 default_timeout_s: float = ...): ...

    async def generate(self, *, model: str, prompt: str,
                       images: list[bytes] | None = None,
                       format: Literal["json"] | None = None,
                       options: dict | None = None,
                       timeout_s: float | None = None) -> dict:
        """POST /api/generate. Holds self._sem_for(model) for the duration.

        Returns parsed JSON dict from Ollama's response['response'] field
        (when format='json' is used). Raises:
          - OllamaTimeout (subclass of TimeoutError) on per-call timeout
          - OllamaParseError on malformed JSON in response (NOT retried)
          - OllamaServerError on 5xx (eligible for retry by caller)
        """

    def _sem_for(self, model: str) -> asyncio.Semaphore: ...
```

Notes:
- Use `httpx.AsyncClient` (already a transitive dependency via FastAPI).
- The semaphore dict is lazy-instantiated on first call per model, lock-protected to prevent two concurrent first-time calls racing on `dict.setdefault`.
- Exception type taxonomy is **load-bearing** for `classification_refine`'s tier-chain logic. `OllamaParseError` falls through to the next tier; `OllamaTimeout` and `OllamaServerError` go through the retry budget first, then fall through.

### `pipeline_service/models/florence_client.py`

A thin async HTTP client to the existing `detection-service/` Florence-2 server.

Stub:

```python
class FlorenceClient:
    """HTTP client to the existing detection-service Florence-2 server."""

    def __init__(self, base_url: str, *, default_timeout_s: float = ...): ...

    async def detect(self, *, frame_bytes: bytes, mime_type: str,
                     frame_id: FrameId,
                     timeout_s: float | None = None) -> list[FlorenceRegion]:
        """POST {base_url}/detect/florence as multipart. Returns the
        regions[] array unmodified. Raises FlorenceServerError on 5xx
        (eligible for caller retry) and FlorenceTimeout on per-call timeout.
        """
```

`FlorenceRegion` is the raw detection-service response shape `{caption: str, x, y, w, h}`. The op (`florence_detect.py`) is responsible for normalising it into `RawDetection`.

### `pipeline_service/ops/florence_detect.py`

The Dagster op. Replaces the section-01 typed pass-through stub.

Op contract (from §3.4 of the plan):

- **Input:** `list[Frame]` (from `frame_intake`).
- **Output:** `list[FrameDetections(detector="florence", frame_id, ...)]` where each `RawDetection = {bbox, label, raw_confidence: Optional[float], frame_id}`. Florence returns no confidence; `raw_confidence=None` (explicit absence — see §5.1).
- **Behaviour:** HTTP POST to existing `detection-service/detect/florence` per frame. Multipart upload. Heartbeats every ≤ 5 s. Op normalises Florence's `{regions:[{caption,x,y,w,h}]}` into `RawDetection` records with `label = caption`, `raw_confidence = None`.
- **Failure mode:** retry 3× per frame. On final fail per frame, emit `FrameDetections(detector_error=True, detections=[])` for that frame. **Other frames continue.** If all frames fail, downstream ops still run (agreement coverage will drop, self-diagnosis will react in section-07).
- **Important plan note (do NOT enforce here):** Florence and Grounding DINO together count as **one signal class** in agreement scoring. That grouping is enforced in `agreement_scoring` (section-07), not here. This op just emits `detector="florence"` on every detection.

Stub:

```python
@op(...)  # Dagster op decorator, retry policy from config
async def florence_detect(frames: list[Frame],
                          florence: FlorenceClient = ...) -> list[FrameDetections]:
    """See plan §3.4. Calls Florence per frame, normalises into
    RawDetection, emits FrameDetections per frame.

    Per-frame failure becomes detector_error=True; the op succeeds.
    Empty input → empty output, not raise.
    """
```

Determinism: sort emitted `detections` per-frame by `(label, x, y)` before returning. This is what makes the replay fixture stable.

### `pipeline_service/ops/classification_refine.py`

The Dagster op. Replaces the section-01 typed pass-through stub.

Op contract (from §3.12 of the plan):

- **Input:** `SceneObservation` (after dedup — but in this section dedup is still a stub, so it's effectively the post-fusion-stub list).
- **Output:** same `SceneObservation` with `vlmStructuredAttributes` populated on each detection.
- **Behaviour:** This is the **existing Qwen-VL tier chain logic**, lifted out of the Temporal workflow. For each dedup'd detection (not each Florence region!), call `qwen2.5vl:7b` with the existing prompt; on timeout/parse failure fall back to `qwen2.5vl:3b`, then `moondream`, then leave `vlmStructuredAttributes = {}` (no fake `florence-only` synthetic attribute set — present-without-enrichment is OK; lying with a default attribute set is not).
- Deduping first cuts Qwen-VL calls (~30 s saved on a busy room) and prevents conflicting attributes for the same physical object.
- **All Ollama calls go through the per-model semaphore in `models/ollama_client.py`.**
- Honour `PipelineConfig.classificationTierForcing` if set: skip earlier tiers and start at the forced one.

Stub:

```python
@op(...)
async def classification_refine(observation: SceneObservation,
                                ollama: OllamaClient = ...,
                                config: PipelineConfig = ...) -> SceneObservation:
    """See plan §3.12. Per-detection Qwen-VL tier chain. Empty detections
    list → return observation unchanged with no Ollama calls.
    """
```

Tier chain:

```
tiers = ["qwen2.5vl:7b", "qwen2.5vl:3b", "moondream"]
if config.classificationTierForcing:
    tiers = tiers[tiers.index(config.classificationTierForcing):]

for detection in observation.detections:
    for tier in tiers:
        try:
            attrs = await call_tier(ollama, tier, detection, ...)
            detection.vlmStructuredAttributes = attrs
            break
        except OllamaParseError:
            continue           # do NOT retry within tier; fall through
        except (OllamaTimeout, OllamaServerError):
            continue           # tier-internal retry handled by ollama_client; fall through after that
    else:
        detection.vlmStructuredAttributes = {}   # not None, not a default
```

The actual prompt text for each tier is **lifted unchanged** from the existing Temporal worker (`api-service/src/temporal/`). This is intentional — Phase 3's job is parity, not improvement. Find the existing prompt strings in the Temporal worker (search for "qwen" or the tier names) and port them verbatim into a `classification_refine_prompts.py` module or inline constants.

### `pipeline_service/dagster_defs.py` (modify)

Replace the section-01 stub registrations of `florence_detect` and `classification_refine` with the new real ops. Other op stubs remain in place (they get replaced in sections 04–07). Keep retry policy + op tags consistent with section-01's pattern.

---

## Side-by-side regression — `tests/integration/test_phase3_regression.py`

This is what gates "section done".

### Fixture corpus

Tiny — 3 to 5 scenes is enough. Each scene = a 3-frame burst. Reuse fixtures already committed in `pipeline-service/tests/replay/fixtures/` if any exist from section-01; otherwise capture three burst scenes from the dev Mac and commit the bytes (small images, < 200 KB each).

### Pre-captured Temporal outputs

Run the existing Temporal path against each fixture once; capture the resulting `EnrichedItem[]` per scene as JSON; commit those JSONs alongside the fixtures at `tests/integration/fixtures/phase3_regression/{scene_id}/temporal_output.json`. The test does **not** spin up a live Temporal worker — it reads these committed outputs and compares against the live Dagster path output.

### Comparison criterion

Per scene:

1. Extract `primary_labels: set[str]` from each side. Lowercase, strip whitespace.
2. Match boxes via Hungarian matching on IoU; for matched pairs, the labels must agree (case-insensitive).
3. **Pass criterion:** Jaccard(temporal_label_set, dagster_label_set) ≥ 0.8 *OR* the symmetric difference contains only labels with confidence < 0.5 on both sides (i.e., low-confidence labels are allowed to differ).
4. **Count criterion:** `abs(len(dagster) - len(temporal)) / max(len(temporal), 1) ≤ 0.2`.

These are intentionally loose — section-04+ adds dedup, fusion, and embedding-based matching that *will* shift counts. The point of this gate is "we didn't accidentally break Florence + Qwen on the way over".

### What this is NOT

- **Not** mAP / recall@IoU — we have no human ground truth.
- **Not** `agreement_coverage` / `agreement_precision` parity — Temporal's `EnrichedItem` lacks `contributingSignals`, so those metrics aren't defined on the Temporal side.
- **Not** an end-to-end test of the whole new DAG — middle ops are still stubs from section-01.

---

## Done checklist

- [ ] `pipeline_service/models/ollama_client.py` exists with per-model `asyncio.Semaphore(1)`; `test_ollama_client.py` passes including the concurrent-call assertion.
- [ ] `pipeline_service/models/florence_client.py` exists; HTTP shim only, no normalisation logic.
- [ ] `pipeline_service/ops/florence_detect.py` implements §3.4 contract; `test_florence_detect.py` passes including per-frame partial-failure semantics, deterministic ordering, and golden replay.
- [ ] `pipeline_service/ops/classification_refine.py` implements §3.12 contract; `test_classification_refine.py` passes including tier-chain fall-through, empty `{}` on total failure (NOT a default attribute set), Ollama semaphore behaviour, log redaction, and golden replay.
- [ ] `dagster_defs.py` registers both real ops, replacing the section-01 stubs.
- [ ] `tests/integration/test_phase3_regression.py` passes against the committed fixture corpus + committed Temporal outputs.
- [ ] Full `cd pipeline-service && uv run pytest` is green (no regressions in section-01 stubs or `test_op_concerns.py`).
- [ ] No new placeholders, no `TODO`, no `pass  # implement me` remaining in the two new ops or two new model clients.
- [ ] Existing Temporal prompt strings ported verbatim into Phase-3 classification (parity, not improvement). Source location of the original prompts is recorded in a comment in `classification_refine.py` for traceability.

---

Files relevant to this section:

- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/pipeline_service/ops/florence_detect.py` (new)
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/pipeline_service/ops/classification_refine.py` (new)
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/pipeline_service/models/florence_client.py` (new)
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/pipeline_service/models/ollama_client.py` (new)
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/pipeline_service/dagster_defs.py` (modify — replace two stubs)
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/tests/unit/ops/test_florence_detect.py` (new)
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/tests/unit/ops/test_classification_refine.py` (new)
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/tests/unit/models/test_ollama_client.py` (new)
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/tests/integration/test_phase3_regression.py` (new)
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/tests/replay/fixtures/florence_detect/` (new directory)
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/tests/replay/fixtures/classification_refine/` (new directory)
- `/Users/mrarindampaul/Develop/allmythings/pipeline-service/tests/integration/fixtures/phase3_regression/` (new directory — committed Temporal outputs)
- `/Users/mrarindampaul/Develop/allmythings/api-service/src/temporal/` (read-only — source of original Qwen prompt strings to port verbatim)