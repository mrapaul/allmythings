# Op-replay tests

"Replay" in this codebase means **op-level pytest replay**, *not* Dagster's
event-history replay.

Each fixture is a JSON document holding:

```json
{
  "op": "<op_name>",
  "case": "<case_name>",
  "input": { ... op-specific input shape ... },
  "expected": { ... op-specific output shape ... }
}
```

The replay runner loads the fixture, invokes the op's `*_impl` function
against the recorded input, and asserts byte-equal JSON output.

To intentionally update fixtures (e.g. after an explicit contract change),
re-record with:

```
REPLAY_REFRESH=1 uv run pytest tests/replay/test_op_replay.py
```

Refreshing fixtures is a dedicated PR — it must include a metric-impact
analysis written into `eval/changelog.md`.
