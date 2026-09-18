# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**allmythings** — Visual Home Inventory Manager. Photograph shelves/drawers/rooms with a phone; the backend extracts an itemized, searchable inventory.

Two active components:

1. **Mobile App** (`/mobile-app`): Expo SDK 54 / React Native 0.81, expo-router, Zustand, Drizzle (SQLite), pnpm. Lint/format via Biome, tests via Vitest.
2. **API Service** (`/api-service`): Node.js 20+, Fastify, TypeScript, Zod. Tests via Vitest. Serves `/v1/detect` and `/v1/detect/stream` (SSE).

Detection runs through `DETECTOR=vlm`: a two-pass VLM detector with a pluggable client (`VlmClient`). Local default is `qwen3-vl:8b-instruct` (M4 Pro) — 8-fixture oracle avg recall 67.5–73.5% across two same-day runs; the 8B is noisy (±6pp run-to-run). `qwen3-vl:30b-a3b-instruct` also lives on the box and scores 77.5–79.3% at ~126–327s/photo (flip `OLLAMA_MODEL` in api-service/.env + `launchctl kickstart -k gui/$(id -u)/com.allmythings.api` to A/B; the live service ends on 8b by choice). Pipeline: pass 1 scene assessment → adaptive 2×2 tiling → pass 2 audit, scored by `eval/scoring.mjs` (head-noun agreement + bipartite assignment; `eval/rescore.mjs` re-scores saved runs without inference). Raw single-shot calls score ~55–62% — the pipeline's tiling+audit is worth ~+15pp. If every backend call fails, the detect fails loud (503 / SSE error), never a fake empty 200. An opt-in **quality tier** (`QUALITY_VLM_*` env + `?tier=quality` on `/v1/detect[/stream]`) routes through an OpenAI-compatible client — validated against NVIDIA's free NIM (`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, distilled from the 30B; accurate labels but contended/slow — offline eval only; paid fallback OpenRouter ~$15/mo). An env-gated closed-vocab **proposer** path (`PROPOSER_ENABLED`, Stage A accept-mode hook, wire contract in `clients/proposer.client.ts`) can replace the VLM detector. `/v1/label` auto-labels user-drawn crops (draw-to-teach); `/v1/corrections` appends every user verdict to the training flywheel (`make dataset-export` → COCO, `make eval-promote SHA=…` → new oracle fixture, `make train-regression-export` → oracle candidates from fully-reviewed photos). Benchmark detail: `eval/results-2026-09-18.md`.

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
