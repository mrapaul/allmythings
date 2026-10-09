# Eval Harness

Offline validation of the detection pipeline. Runs candidate VLMs against fixture photos, scores recall against oracle gold labels, gates merges on regressions.

## Layout

- `fixtures/*.jpg` — input images. Add new ones by copying from phone via `xcrun devicectl device copy from ...`.
- `oracle/*.json` — ground-truth expected-items list per fixture. Update when a fixture is added.
- `harness.mjs` — the runner. Sends each fixture to each model, parses JSON, scores, writes `runs/<model>__<fixture>__<timestamp>.json`.
- `baseline.json` — snapshot of the leaderboard we won't regress below.
- `report-*.json` — per-invocation snapshots.

## Commands

- `make eval` — run all candidate models
- `make eval-ci` — run + fail if any model regresses > 1% below baseline
- `make eval-baseline` — re-snapshot after an intentional improvement (commit after)

## Adding a fixture

1. Pull from phone: `xcrun devicectl device copy from --device <id> --source /Library/Caches/ --destination /tmp/ph --domain-type appDataContainer --domain-identifier me.arindampaul.allmythings`
2. Rotate if needed: `sips -r 90 /tmp/ph/Library/Caches/XXX.jpg --out eval/fixtures/<name>.jpg`
3. Write oracle JSON: use `eval/oracle/*.json` as a template. List every item you see; set `min_item_count` and `max_item_count`.
4. Run `make eval-baseline` and commit the new baseline with the new fixture.

## Adding a model

Edit the model list in the `eval` / `eval-ci` / `eval-baseline` targets in `Makefile`. Must be available via `ollama list`. Pull first: `ollama pull <model-tag>`.

## Hybrid pipeline (after Task 19)

Prefix model name with `hybrid:` (e.g. `hybrid:owlv2-qwen7b`) to route through the api-service `/v1/detect` endpoint instead of direct Ollama. Requires `HYBRID_ENABLED=true` in `api-service/.env`.

## Vocabulary priming (api: runs)

Set `VOCAB_FILE=/path/to/vocab.json` (a JSON array of strings, e.g. `["navy blue couch", "brass floor lamp"]`) to attach the owner's inventory names as the multipart `vocab` field on `api:` runs. The production detector then primes its prompts to reuse those exact names when they match a detected object. Unset (or unreadable/invalid) means no `vocab` part is attached — requests are identical to a run without this flag, so results stay comparable to the existing baseline.
