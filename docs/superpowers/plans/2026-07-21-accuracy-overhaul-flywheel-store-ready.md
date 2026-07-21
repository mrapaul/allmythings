# Accuracy Overhaul, Correction Flywheel & Store-Ready Build — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an accurate, self-correcting home-inventory detection pipeline (frontier free-tier VLM + adaptive tiling + photo QA + draw-to-teach corrections + training-data flywheel) and a store-ready mobile build.

**Architecture:** The API keeps its two-pass VLM detector but the client becomes pluggable (`VlmClient` interface): a new fetch-based Gemini client (structured output) joins the existing Ollama client, composed with automatic fallback. Pass 1 gains a scene assessment (type, density, photo-quality verdict) which drives server-side adaptive 2×2 tiling for wide rooms. The mobile detection screen gains a box overlay, draw-to-teach gesture, and posts every user verdict to a corrections endpoint that appends COCO-exportable flywheel JSONL.

**Tech Stack:** Node 20/Fastify/TypeScript/sharp/Vitest (API), Expo SDK 54/RN 0.81/Zustand/Vitest (mobile), Gemini REST API (`generativelanguage.googleapis.com`, free tier, key already in `.env`), Ollama cloud `gemma4:31b-cloud` (fallback), eval harness as accuracy gate.

## Global Constraints

- Free-tier/open-source only; no paid services. `GEMINI_API_KEY` already present in `api-service/.env` (gitignored); never hardcode keys.
- Accuracy claims require `make eval` against the oracle; unit tests prove plumbing only.
- No hardcoded object lists driving behavior (the architectural-label drop-list in parse.ts is an output filter and stays).
- API tests: `cd api-service && npx vitest run <file>`; mobile tests: `cd mobile-app && pnpm vitest run <file>`.
- Conventional commits; no attribution footer.
- Mobile/API contract flows from `api-service/openapi.json` (`make generate` after route/schema changes).
- Existing `DetectedItem` contract `{label, description, category, tags, box{x,y,width,height}}` (normalized [0,1]) must not break.

---

### Task 1: Shared VlmClient interface + DetectorUnavailableError

**Files:**
- Create: `api-service/src/clients/vlm-client.ts`
- Modify: `api-service/src/clients/ollama-vlm.client.ts` (implement interface; OllamaUnavailableError extends DetectorUnavailableError)
- Modify: `api-service/src/routes/detect.route.ts`, `detect-stream.route.ts` (catch DetectorUnavailableError)
- Test: `api-service/src/clients/vlm-client.test.ts`

**Interfaces (produced):**
```ts
export class DetectorUnavailableError extends Error {
  constructor(message: string, readonly retryable = true) { super(message); this.name = 'DetectorUnavailableError'; }
}
export interface VlmClient {
  readonly modelName: string;
  /** JSON-constrained call; optional OpenAPI-style schema for backends that support structured output. */
  generateJson(prompt: string, imageBase64: string, schema?: object): Promise<string>;
}
```
`VlmDetector` constructor changes to accept `VlmClient` (structural — Ollama client already matches). Routes replace `err instanceof OllamaUnavailableError` with `err instanceof DetectorUnavailableError`.

Steps: failing test (instanceof chain: OllamaUnavailableError instanceof DetectorUnavailableError; VlmDetector accepts a stub VlmClient) → implement → full API test suite green → commit `refactor(api): pluggable VlmClient with shared DetectorUnavailableError`.

### Task 2: GeminiVlmClient (fetch, structured output, 429-aware)

**Files:**
- Create: `api-service/src/clients/gemini-vlm.client.ts`
- Test: `api-service/src/clients/gemini-vlm.client.test.ts` (mock global fetch)

**Interfaces (produced):**
```ts
export class GeminiVlmClient implements VlmClient {
  constructor(opts: { apiKey: string; model: string; timeoutMs: number });
  get modelName(): string;
  generateJson(prompt: string, imageBase64: string, schema?: object): Promise<string>;
}
```
POST `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` with header `x-goog-api-key`, body `{contents:[{parts:[{inline_data:{mime_type:'image/jpeg',data:imageBase64}},{text:prompt}]}],generationConfig:{temperature:0.1,responseMimeType:'application/json',...(schema?{responseSchema:schema}:{})}}`. Return `candidates[0].content.parts.map(p=>p.text).join('')`. Errors → `DetectorUnavailableError`; on HTTP 429 set `retryable=true` and include 'rate_limit' in message. AbortController timeout like Ollama client.

Tests: success path extracts text; 429 → DetectorUnavailableError with rate_limit; network error wraps; schema present in body when passed. Commit `feat(api): Gemini structured-output VLM client`.

### Task 3: Scene assessment in pass 1

**Files:**
- Modify: `api-service/src/services/vlm-detector.parse.ts` (prompt + new parser)
- Modify: `api-service/src/services/vlm-detector.ts` (expose scene)
- Test: `api-service/src/services/vlm-detector.parse.test.ts` (extend existing)

**Interfaces (produced):**
```ts
export type SceneType = 'shelf' | 'drawer' | 'room' | 'closeup' | 'unknown';
export type PhotoVerdict = 'ok' | 'too_dark' | 'too_blurry' | 'too_far' | 'not_a_scene';
export interface SceneInfo { type: SceneType; estimatedTotalItems: number | null; verdict: PhotoVerdict; verdictReason: string | null; }
export function parseSceneInfo(parsed: unknown): SceneInfo; // tolerant; defaults {type:'unknown', estimatedTotalItems:null, verdict:'ok', verdictReason:null}
```
Pass-1 prompt gains a required top-level `"scene"` object: `{"type":"shelf|drawer|room|closeup","estimated_total_items":int,"photo_quality":{"verdict":"ok|too_dark|too_blurry|too_far|not_a_scene","reason":"..."}}`. `VlmDetector.detectStream` parses it from pass-1 JSON and yields it first via a new union: `async *detectStream(buf): AsyncGenerator<{kind:'scene';scene:SceneInfo} | {kind:'item';item:DetectedItem}>`. `detect()` returns `{scene, items}` as `DetectionResult`. Update route call sites minimally (they adapt in Task 6; this task keeps routes compiling by adapting them to the new generator shape).

Commit `feat(api): pass-1 scene assessment (type, density, photo verdict)`.

### Task 4: Adaptive tiling for wide scenes

**Files:**
- Create: `api-service/src/services/vlm-detector.tiling.ts`
- Test: `api-service/src/services/vlm-detector.tiling.test.ts`
- Modify: `api-service/src/services/vlm-detector.ts` (tile pass between pass 1 and audit)

**Interfaces (produced):**
```ts
export interface TileRect { left: number; top: number; width: number; height: number }
export const TILE_GRID = 2, TILE_OVERLAP = 0.15, TILE_TRIGGER_MIN_ITEMS = 12, TILE_TRIGGER_MISSING = 4;
export function shouldTile(scene: SceneInfo, pass1Count: number): boolean;
// true iff scene.type === 'room' && (pass1Count >= TILE_TRIGGER_MIN_ITEMS || (scene.estimatedTotalItems ?? 0) - pass1Count >= TILE_TRIGGER_MISSING)
export function computeTileRects(w: number, h: number): TileRect[]; // 2×2 with 15% overlap, integer px, clamped
export function mapTileBoxToFull(box: NormBox, tile: TileRect, fullW: number, fullH: number): NormBox;
```
Detector flow: pass 1 → if `shouldTile`, for each tile: `sharp(buffer).extract(tile)` → single pass-1-style call → map boxes to full coords → dedupe against seen (existing `dedupeItems`) → yield new items. Tile failures are logged and skipped (never fail the run). Then pass-2 audit as today. Tests cover: shouldTile truth table, rect math exactness (overlap, coverage of full image), box mapping round-trip.

Commit `feat(api): adaptive 2x2 tiling for wide room scenes`.

### Task 5: Factory with primary→fallback chain + env

**Files:**
- Modify: `api-service/src/services/vlm-detector.factory.ts`, `env.config.ts`, `.env.example`, `app.ts` (if wiring names change)
- Create: `api-service/src/services/vlm-detector.fallback.ts`
- Test: `api-service/src/services/vlm-detector.fallback.test.ts`

**Interfaces (produced):**
```ts
export class FallbackDetector { // same public surface as VlmDetector
  constructor(primary: VlmDetector, secondary: VlmDetector | null);
  detect(buf: Buffer): Promise<DetectionResult>;
  detectStream(buf: Buffer): AsyncGenerator<DetectorEvent>; // primary; on DetectorUnavailableError before any item → secondary
}
export function createVlmDetector(): FallbackDetector; // gemini primary when GEMINI_API_KEY set, ollama secondary; ollama-only otherwise
```
env: `geminiModel` default → `'gemini-2.5-flash'`. `.env.example` documents GEMINI_API_KEY/GEMINI_MODEL/OLLAMA_MODEL=gemma4:31b-cloud. Startup log states active chain. Commit `feat(api): gemini-primary detector chain with ollama fallback`.

### Task 6: Scene over the wire (SSE + JSON) and mobile plumbing

**Files:**
- Modify: `api-service/src/routes/detect.route.ts` (`{scene, items}`), `detect-stream.route.ts` (SSE `scene` event first), openapi export (`npm run export:openapi` → `make generate`)
- Modify: `mobile-app/api/types.ts` (`DetectStreamEvent` + `{type:'scene'; scene: SceneInfo}`), `mobile-app/api/sse.ts` parser, `mobile-app/stores/detection-screen.store.ts` (hold `scene`)
- Tests: extend `detect.route`/SSE tests (API), `sse.test.ts` + store test (mobile)

Commit `feat: stream scene assessment to the app`.

### Task 7: Eval bake-off — Gemini vs gemma4 (ACCURACY GATE)

**Files:**
- Modify: `eval/harness.mjs` (add `gemini:<model>` runner using GEMINI_API_KEY + same PROMPT via REST, structured JSON), `Makefile` (eval/eval-ci/eval-baseline model lists → `gemini:gemini-2.5-flash gemma4:31b-cloud`)

Run `make eval`. Winner (highest avg recall, failures counted) becomes default detector order; if Gemini wins, keep chain as Task 5; if gemma4 wins, factory order flips via env not code (`DETECTOR_PRIMARY=ollama|gemini`, default from bake-off result). Re-snapshot `eval/baseline.json` via `make eval-baseline`, commit report + baseline: `feat(detection): adopt <winner> after eval bake-off; new baseline`.

### Task 8: On-device photo pre-check

**Files:**
- Create: `mobile-app/lib/photo-quality.ts`, test `mobile-app/lib/photo-quality.test.ts`
- Modify: `mobile-app/app/detection.tsx` (after manipulate: check → banner with Retake/Use-anyway before upload)

```ts
export const MIN_BYTES_PER_PIXEL = 0.035; // JPEG below this is near-certainly blurry/dark/featureless
export function assessJpeg(bytes: number, w: number, h: number): 'ok' | 'suspect';
```
expo-file-system `getInfoAsync` for size (verify dependency exists in package.json; add if missing). Server verdict (Task 6 scene event) remains authoritative: `verdict !== 'ok'` renders a reject card with reason + Retake button replacing the rows list. Commit `feat(mobile): photo quality gate (on-device heuristic + server verdict)`.

### Task 9: Box overlay on the review photo

**Files:**
- Modify: `mobile-app/app/detection.tsx` — render existing `BoundingBoxOverlay` inside `photoFrame` (`contentFit="cover"` → pass cover-cropped view size; simplest correct: switch photo to `contentFit="contain"` sized by aspect ratio so normalized boxes map 1:1), boxes from `rows` (`{id, label: r.item.label, box, included, saved}`)
- Test: extend `detection.test.tsx` snapshot/queries

Commit `feat(mobile): live bounding-box overlay on review photo`.

### Task 10: /v1/label endpoint (auto-label a crop)

**Files:**
- Create: `api-service/src/routes/label.route.ts`, test `label.route.test.ts`
- Modify: `api-service/src/app.ts` (register), openapi + `make generate`
- Create: `mobile-app/api/label.ts` (`labelCrop(fileUri): Promise<{label:string;category:string;tags:string[];description:string}>`)

POST multipart single image → active VlmClient with single-object prompt (`"Identify the single main object in this crop"`, same category enum, JSON `{object, category, tags{...}}`) → reuse `rawItemToDetectedItem` mapping minus box (`box` = full-crop `{x:0,y:0,width:1,height:1}` placeholder, stripped in response). Errors → 503 detector_unavailable. Commit `feat(api): /v1/label single-crop auto-labeling`.

### Task 11: Draw-to-teach gesture

**Files:**
- Create: `mobile-app/components/DrawBoxOverlay.tsx` + test (pure geometry helpers exported: `clampRect`, `viewRectToNormBox(rect, viewW, viewH)`)
- Modify: `mobile-app/app/detection.tsx` (PanResponder long-press-drag on photo → rect preview → on release: ImageManipulator crop (normalized→pixel) → `labelCrop` → `addManualRow`)
- Modify: `mobile-app/stores/detection-screen.store.ts` (`addManualRow(item: DetectedItem): string` — id `manual-<n>`, included:true, source flag `manual: true` on row)

Suggested label arrives → row appears highlighted at top of list, already editable via existing chips; user taps ✓ (existing save). If /v1/label fails, row is added with label `"new item"` for manual naming — the gesture never dead-ends. Commit `feat(mobile): draw-to-teach missed objects with auto-label`.

### Task 12: Corrections endpoint + client queue (flywheel intake)

**Files:**
- Create: `api-service/src/routes/corrections.route.ts` (+test), `api-service/src/services/flywheel.service.ts` (+test)
- Modify: `api-service/src/app.ts`, openapi, `make generate`
- Create: `mobile-app/lib/corrections-queue.ts` (+test)
- Modify: `mobile-app/app/detection.tsx` (emit events on save/discard/relabel/manual-add/verdict; flush queue on mount)

**Wire shape (produced):**
```ts
// POST /v1/corrections  body:
{ photoSha256: string, model: string, capturedAt: string,
  scene: SceneInfo | null,
  events: Array<
    | {type:'accept'|'discard'; item: DetectedItem}
    | {type:'relabel'; item: DetectedItem; newLabel: string; newTags: string[]}
    | {type:'add_box'; item: DetectedItem}            // user-drawn
    | {type:'photo_verdict'; verdict: PhotoVerdict; userOverride: boolean}> }
```
Zod-validated. `FlywheelService.append(record)` writes one JSON line to `${photoDir}/flywheel/YYYY-MM-DD.jsonl` (mkdir -p, append). photoSha256 comes from the SSE `meta` event — extend meta to include it server-side. Queue: Prefs-backed array, `enqueue(payload)` then `flush()` (POST, on failure keep; drop after 20 stored). Commit `feat: corrections flywheel — client events to append-only JSONL`.

### Task 13: Dataset export + fixture promotion

**Files:**
- Create: `scripts/dataset-export.mjs`, `scripts/promote-fixture.mjs`, pure core `scripts/lib/flywheel-to-coco.mjs`
- Test: `api-service/src/services/flywheel-export.test.ts` (imports the .mjs core by relative path)
- Modify: `Makefile` (`dataset-export`, `eval-promote SHA=<sha>`)

`flywheelToCoco(records, imageDims)` → `{images:[{id,file_name,width,height}], annotations:[{id,image_id,category_id,bbox:[x,y,w,h] px,area,iscrowd:0}], categories}` from final accepted+manual items only (discarded excluded; relabels use newLabel). Export copies referenced photos from `${photoDir}/photos` into `datasets/export-YYYY-MM-DD/images/`; prints counts (records read, images found/missing, annotations written) — no silent drops. `promote-fixture <sha>` copies photo to `eval/fixtures/<sha>.jpg` and writes `eval/oracle/<sha>.json` (`expected_items` from verified labels, min/max = count ±20%). `datasets/` gitignored. Commit `feat(flywheel): COCO dataset export and eval-fixture promotion`.

### Task 14: Store-ready app

**Files:**
- Modify: `mobile-app/app.json` (icon `./assets/images/app_icon.png`, adaptiveIcon foregroundImage, splash image, `ios.infoPlist` NSCameraUsageDescription/NSPhotoLibraryUsageDescription/NSPhotoLibraryAddUsageDescription, `ios.privacyManifests` if required by SDK 54 build, version 1.0.0)
- Modify: `mobile-app/app/settings.tsx` (+test): "Server URL" field persisted via Prefs (`getApiBaseUrlOverride/setApiBaseUrlOverride`), `mobile-app/api/client.ts` reads override at request time
- Modify: `mobile-app/stores/prefs.ts` (new keys)
- Create: `docs/store/metadata.md` (name, subtitle, description, keywords, category, screenshot checklist, privacy answers)

Commit `feat(mobile): store-ready config + in-app server URL setting`.

### Task 15: Full verification

- `make verify` (lint + API + mobile tests) green; `cd mobile-app && pnpm typecheck`; `cd api-service && npm run type-check`
- `make eval-ci` passes against new baseline
- `make smoke` end-to-end
- Manual: `make start`, run app in simulator against localhost, full flow: capture → QA → detect (watch tiling on room fixture) → toggle/draw-to-teach → save → corrections JSONL appears → `make dataset-export` produces valid COCO
- Fix anything found; final commit `chore: verification fixes for accuracy-overhaul release`

---

## Self-review notes

- Spec coverage: detector accuracy (T1–7), accept/reject (T3,6,8), correction UX (T9–11), flywheel (T12–13), store-ready (T14), verification (T15). Wide-room handling = T4 (server-side, per approved design). Continuous training = flywheel-first per user decision; export path is the training on-ramp.
- Contract consistency: `DetectorEvent = {kind:'scene'|'item'}` (T3) consumed by T5 fallback and T6 routes; `SceneInfo`/`PhotoVerdict` (T3) reused in T6, T8, T12. `DetectionResult {scene, items}` (T3) used in T5, T7 unaffected (harness calls REST directly).
- Eval gate honored: only T7 makes accuracy claims.
