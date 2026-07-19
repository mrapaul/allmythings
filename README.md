# allmythings — Visual Home Inventory Manager

Photograph shelves, drawers, and rooms with your phone; get an accurate, itemized, searchable inventory of everything you own.

## Architecture

- **Mobile App (`/mobile-app`):** Expo SDK 54 / React Native 0.81, expo-router, Zustand, Drizzle (SQLite). Captures photos and streams detection results over SSE.
- **API Service (`/api-service`):** Node.js 20+, Fastify, TypeScript. `/v1/detect` and `/v1/detect/stream` turn a photo into structured items.
- **Eval Harness (`/eval`):** Scores every detector candidate against human-labeled oracle photos; `eval/baseline.json` gates regressions.

Detection currently uses a local VLM via Ollama (`qwen2.5vl:7b`, ~57–64% measured recall) and is being replaced with a frontier-VLM structured-output detector.

## Quick Start

Prerequisites: Node.js 20+, pnpm, Docker.

```bash
make install       # dependencies for API + mobile
make dev-api       # API on http://localhost:14000
make dev-mobile    # Expo dev server (pnpm ios / pnpm android for native builds)
```

## Testing & Verification

```bash
make test          # unit tests (API + mobile)
make verify        # lint + tests
make eval          # detector accuracy vs oracle photos (the metric that matters)
make smoke         # end-to-end smoke test
```

## License

Private project. All rights reserved.
