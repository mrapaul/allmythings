# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**allmythings** — Visual Home Inventory Manager. Photograph shelves/drawers/rooms with a phone; the backend extracts an itemized, searchable inventory.

Two active components:

1. **Mobile App** (`/mobile-app`): Expo SDK 54 / React Native 0.81, expo-router, Zustand, Drizzle (SQLite), pnpm. Lint/format via Biome, tests via Vitest.
2. **API Service** (`/api-service`): Node.js 20+, Fastify, TypeScript, Zod. Tests via Vitest. Serves `/v1/detect` and `/v1/detect/stream` (SSE).

Detection today runs through `DETECTOR=vlm`: a two-pass call to Ollama (`qwen2.5vl:7b`, `OLLAMA_BASE_URL`, default `http://localhost:11434`). Measured accuracy of this path is ~57–64% recall (`eval/baseline.json`); it is being replaced by a frontier-VLM structured-output detector. Do not extend the local-model path.

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
