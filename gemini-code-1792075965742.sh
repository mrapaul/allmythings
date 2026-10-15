#!/usr/bin/env bash
set -euo pipefail

echo "==> Updating pnpm-workspace.yaml to use pnpm v10+ allowBuilds format..."
cat << 'EOF' > pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'api-service'
  - 'mobile-app'

allowBuilds:
  '@biomejs/biome': true
  '@sentry/cli': true
  'better-sqlite3': true
  'esbuild': true
  'protobufjs': true
  'sharp': true
EOF

echo "==> Running pnpm install with allowed native builds..."
pnpm install --no-frozen-lockfile

echo "==> Running unit, burst-selector, and golden oracle regression gates..."
pnpm --filter mobile-app exec vitest run lib/burst-lucky-selector.test.ts
node --test eval/scoring.test.mjs
node eval/regression-gate.mjs

echo "==> Staging, committing, merging into main, and pushing to GitHub..."
git add -A
git commit -m "fix: update pnpm-workspace.yaml to pnpm v10+ allowBuilds format

- Fix ERR_PNPM_IGNORED_BUILDS by migrating native build permissions to allowBuilds map in pnpm-workspace.yaml
- Successfully verify unit tests, burst selector, and golden oracle accuracy regression gates"

git checkout main
git merge --no-ff feat/zero-enum-slm-and-on-device-coach -m "Merge feat/zero-enum-slm-and-on-device-coach into main"
git push origin main

echo "✅ All changes verified, merged, and pushed to origin/main successfully!"