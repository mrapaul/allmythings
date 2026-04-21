# Recorded Workflow Histories

These JSON files are full workflow histories captured from real (or in-memory test) workflow executions. The replay test (`detect-inventory.replay.test.ts`) replays each history against the current workflow code and fails if the replay diverges — catching non-deterministic regressions before production.

## Regenerating

When you intentionally change workflow code:

1. Keep existing histories (they assert backward-compat across deprecated code paths if using `patched()`)
2. OR delete obsolete histories and regenerate by running:
   ```
   cd api-service && npx tsx src/__tests__/workflow/record-happy-path.ts
   ```

## Files

- `happy-path-qwen7b.json` — 1 region, tier-1 enrichment succeeds on first attempt
