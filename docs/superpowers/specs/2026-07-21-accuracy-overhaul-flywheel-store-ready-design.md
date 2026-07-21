# Accuracy Overhaul, Correction Flywheel & Store-Ready Build — Design

**Date:** 2026-07-21
**Status:** Approved (user, 2026-07-21)
**Supersedes:** detection portions of 2026-04-13-accuracy-first-three-tier-detection-design.md (Flutter-era, pre-prune)

## Goal

A fully working, verified personal home-inventory app: photograph a shelf/drawer/room, get an accurate itemized inventory, reject bad photos, correct the model with minimal gestures, accumulate every interaction as training data, and produce a store-ready build. Constraints from user: **zero-cost / free-tier / open-source only**, personal use (single user), accuracy is the top priority, no hardcoded object lists.

## Non-goals

- Actual store submission (user runs Submit with their own accounts).
- Running LoRA fine-tuning now — the flywheel collects and exports data; training jobs start once volume justifies it.
- Multi-tenant/public hosting. The API stays self-hosted (dev Mac / home server) and reachable via a user-configurable base URL (Tailscale for off-LAN).

## Approach decision

Bake-off of free options via the existing eval harness (the only accepted accuracy authority):

- **Gemini API free tier** — new structured-output detector with native bounding boxes.
- **gemma4:31b-cloud** (Ollama cloud free tier) — current best at 76.3% avg recall.

Winner becomes `DETECTOR` default; loser is the automatic fallback when the primary errors or rate-limits. Local-only models are rejected (proven ~60% recall plateau). `eval/baseline.json` is re-snapshotted to the winner once approved.

## Phase 1 — Detector accuracy

- New `gemini` detector behind the existing detector port (`vlm-detector.factory.ts`, `DETECTOR` env). Structured output; boxes normalized to the existing `NormBox` `{x,y,width,height}` in [0,1] via the existing `parse.ts` normalization (Gemini emits 0–1000 `box_2d`).
- `GEMINI_API_KEY` via env only (gitignored `.env`; `.env.example` updated). No key → factory falls back to the Ollama detector; startup logs which detectors are live.
- **Adaptive density tiling (wide-room handling):** pass 1 full-frame detection also classifies the scene (`shelf | drawer | room-wide | close-up`) and returns item density. If scene is room-wide **or** item count approaches the model's saturation point, the server splits the image into overlapping tiles (2×2, ~15% overlap), runs detection per tile, and merges via the existing IoU dedup. The split decision is model-output-driven — no hardcoded object lists or per-room rules. Tile passes stream progress over the existing SSE channel.
- Fallback chain: primary detector → secondary detector → error with actionable message. Provider health surfaced via the existing provider-health service.
- **Gate:** `make eval` before/after; the change ships only if avg recall beats the 76.3% reference; `baseline.json` updated in the same commit as the approval note.

## Phase 2 — Photo accept/reject

- **On-device pre-check (no native ML deps):** cheap sharpness/exposure heuristic on the captured image; below threshold → immediate "Retake?" prompt before any upload. Thresholds are constants in one module, unit-tested.
- **Model-side verdict:** pass 1 response includes a photo-quality verdict (`ok | too_dark | too_blurry | too_far | not_a_scene`) with reason; the app surfaces reject-with-reason and offers retake. Rejected photos are not added to inventory but ARE logged to the flywheel (negative samples).

## Phase 3 — Correction UX (review screen)

The existing detection screen becomes the review surface. Requirements: teaching the model must not add steps to the happy path.

- Detected boxes overlaid on the photo; tap a box toggles accept/reject; long-press a box to edit its label.
- **Draw-to-teach:** long-press-drag on empty photo area draws a new box. The crop is sent to a new `POST /v1/label` endpoint; the model auto-suggests a label + attributes; user confirms with one tap (or edits). Total cost of teaching a missed object: one gesture + one tap.
- Accept-all remains the default fast path (single confirm button) so the flow is no slower than today.
- Every action (accept, reject, relabel, added box, photo verdict) is posted to the API as a correction event.

## Phase 4 — Training flywheel

- API persists every sample: original photo, raw model output, final user-verified item set (labels + boxes), scene class, photo verdict, model/version metadata. Storage: images on disk (existing photo storage service) + append-only JSONL per day; no new database required at single-user scale.
- `make dataset-export` → COCO-format dataset (images + annotations) versioned by export date, ready for LoRA fine-tuning of an open detector/VLM later. Export excludes nothing silently — counts are printed.
- Corrected samples can be **promoted to eval fixtures** via a small script, so the oracle (currently 4 fixtures) grows with real use and the accuracy gate gets harder over time.
- Fine-tuning itself is explicitly deferred; when it starts, candidates are gated by `make eval` like any detector.

## Phase 5 — Store-ready build

- App icon + splash, iOS permission strings (camera/photos), iOS Privacy Manifest, Android permissions, version/build numbers, production EAS build profile.
- API base URL becomes a real in-app setting (persisted), defaulting from config; documented Tailscale setup so the published build reaches the self-hosted API off-LAN.
- Store metadata drafted (name, subtitle, description, keywords, screenshots checklist) under `docs/store/`.
- Definition of done: `make verify` green, `make eval` at/above baseline, `make smoke` passes, production EAS build completes, app verified on a physical device.

## Data flow (end-to-end)

photo → on-device QA → upload → pass 1 (scene + verdict + full-frame items) → [adaptive tiling passes] → merged items over SSE → review screen (accept/reject/teach) → correction events → flywheel JSONL + inventory DB → (later) dataset export → fine-tune → eval gate.

## Error handling

- Detector failures: fall back through the chain; SSE reports which provider served the result; final failure returns a typed error the app renders with retry.
- Free-tier rate limits: detect 429s, back off, and fail over to the secondary detector rather than erroring the user.
- Correction posts are queued locally and retried if the API is unreachable (photo already on device; nothing lost).

## Testing

- TDD throughout (Vitest both sides). Unit: parsers, tiling decision, merge/dedup, QA heuristics, correction reducers, dataset export. Integration: routes with mocked providers. Accuracy: `make eval` only — unit tests never justify accuracy claims. End-to-end: `make smoke` + on-device verification.
