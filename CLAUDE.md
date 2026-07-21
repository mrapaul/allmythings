# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**allmythings** — Visual Home Inventory Manager. Photograph shelves/drawers/rooms with a phone; the backend extracts an itemized, searchable inventory.

Two active components:

1. **Mobile App** (`/mobile-app`): Expo SDK 54 / React Native 0.81, expo-router, Zustand, Drizzle (SQLite), pnpm. Lint/format via Biome, tests via Vitest.
2. **API Service** (`/api-service`): Node.js 20+, Fastify, TypeScript, Zod. Tests via Vitest. Serves `/v1/detect` and `/v1/detect/stream` (SSE).

Detection runs through `DETECTOR=vlm`: a two-pass VLM detector with a pluggable client (`VlmClient`). The chain is Gemini (structured output, when `GEMINI_API_KEY` is set) → Ollama fallback; with no Gemini key it runs Ollama-only on `gemma4:31b-cloud` (Ollama cloud free tier), the current eval-gated baseline at **80.6% avg recall** (`eval/baseline.json`, 2026-07-21). Pass 1 also returns a scene assessment (type/density/photo verdict) that drives server-side adaptive 2×2 tiling for wide room scenes and photo accept/reject in the app. `/v1/label` auto-labels user-drawn crops (draw-to-teach); `/v1/corrections` appends every user verdict to the training flywheel (`make dataset-export` → COCO, `make eval-promote SHA=…` → new oracle fixture).

Supporting directories:

- `/eval` — accuracy harness scoring detectors against human-labeled oracle photos (`eval/baseline.json` is the gate; `make eval-ci` fails on >1% regression). This is the source of truth for detection quality.
- `/test_images` — room/shelf photo fixtures.
- `/db` — dbmate migrations for Postgres (`make db-up`).
- `/observability` — LGTM stack compose files (Grafana/Loki/Tempo/Prometheus).
- `/prompts` — VLM prompt template references (runtime prompts live in `api-service/src/services/vlm-detector.parse.ts`).
- `/docs` — plans and decision history.

Historical branches: `wip/local-vlm-tiered-experiments` preserves the abandoned Grounding-DINO/tiered local-detector experiments.

## Common Commands

```bash
make install           # API (npm) + mobile (pnpm) dependencies
make dev-api           # API on http://localhost:14000 (tsx watch)
make dev-mobile        # Expo dev server
make start             # Full local stack via scripts/start-all.sh (obs + Ollama + API + warmup)
make stop / status     # Stop / inspect the stack

make test              # API + mobile unit tests (Vitest, mocked — plumbing only)
make lint / format     # Biome (mobile) + ESLint/Prettier (API)
make verify            # lint + test
make generate          # Regenerate mobile API client from api-service/openapi.json

make eval              # Score detector candidates against oracle photos
make eval-ci           # Same, gated by eval/baseline.json
make smoke             # scripts/smoke.sh end-to-end smoke test
```

Mobile native runs: `cd mobile-app && pnpm ios` / `pnpm android` (dev client), EAS profiles in `mobile-app/eas.json`.

## Key Paths

- API detection entry: `api-service/src/routes/detect.route.ts`, `detect-stream.route.ts`
- Detector construction: `api-service/src/services/vlm-detector.factory.ts` (selected via `DETECTOR` in `env.config.ts`)
- Mobile detection screen: `mobile-app/app/detection.tsx`; API client in `mobile-app/api/`
- Mobile API base URL: `mobile-app/app.config.js` (`API_BASE_URL` env override; default is a LAN IP because `localhost` on a physical phone points at the phone itself)

## Rules

- **Accuracy claims require an eval run.** Any detector change must be scored with `make eval` against the oracle before it is called an improvement; unit tests are mocked and prove nothing about detection quality.
- Never commit secrets, keys, or model weights (`*.pt`/`*.onnx` are gitignored).
- Env config through `.env` files (gitignored); examples in `.env.example`.
