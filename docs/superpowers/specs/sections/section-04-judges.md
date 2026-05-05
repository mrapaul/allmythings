Now I have enough context. I'll generate the section content.

# Section 04 — Judges (`gt_eval.judges`)

## Overview

This section implements the **`ReferenceModelJudge` Protocol** and its v1 concrete implementation, **`QwenLocalJudge`**, used by the hallucination metric in §05 to verify whether a predicted detection with no GT overlap actually shows the claimed object. The judge wraps the existing async `OllamaClient` and forces a structured JSON verdict (`yes`/`no`/`unsure`) using a 1.5×-expanded crop.

The Protocol surface is intentionally minimal so v2 can plug in cloud VLM judges (GPT-4o, Claude, Gemini) without refactoring the orchestrator.

## Dependencies

- **§01 (foundation)** must be complete:
  - The package skeleton at `pipeline-service/pipeline_service/eval/gt_eval/judges/` exists with an empty `__init__.py`.
  - `pipeline-service/tests/unit/eval/conftest.py` exposes a mock `OllamaClient` fixture.
  - All new pyproject deps are installed (no new deps required for this section beyond §01).
- **No other section dependencies.** This section is parallelizable with §02 (datasets), §03 (matchers), and §07 (pipeline-shim).

## Files Created in This Section

```
pipeline-service/pipeline_service/eval/gt_eval/judges/
├── __init__.py              (extended — re-export Protocol + QwenLocalJudge + JudgeVerdict)
├── protocol.py              (NEW — Protocol + Literal type)
└── qwen_local.py            (NEW — Ollama-backed Qwen-VL impl)

pipeline-service/tests/unit/eval/
├── test_judge_protocol.py    (NEW)
└── test_qwen_local_judge.py  (NEW)
```

## Files NOT Modified

- `pipeline_service/models/ollama_client.py` — **wrapped, never modified.** The existing async `OllamaClient` is composed by `QwenLocalJudge` via constructor injection.

---

## Tests FIRST

Tests live under `pipeline-service/tests/unit/eval/`. The shared `conftest.py` from §01 already provides a mocked `OllamaClient` fixture.

### `tests/unit/eval/test_judge_protocol.py`

Pin the Protocol surface — small, two tests:

```python
"""Protocol-shape pins for the ReferenceModelJudge surface.

Keeps v2 cloud-judge implementations honest about the contract:
binary verification of (crop_bytes, label) -> JudgeVerdict.
"""

import typing
from pipeline_service.eval.gt_eval.judges.protocol import (
    JudgeVerdict,
    ReferenceModelJudge,
)


def test_reference_model_judge_protocol_is_runtime_checkable() -> None:
    """isinstance(obj, ReferenceModelJudge) must work at runtime."""
    # Assert that ReferenceModelJudge is decorated @runtime_checkable.
    # (Inspect via typing.get_type_hints / Protocol introspection.)
    ...


def test_judge_verdict_literal_accepts_only_three_values() -> None:
    """JudgeVerdict = Literal['yes', 'no', 'unsure']."""
    args = typing.get_args(JudgeVerdict)
    assert set(args) == {"yes", "no", "unsure"}
```

### `tests/unit/eval/test_qwen_local_judge.py`

Pin the Qwen-local concrete impl — full behaviour matrix. Fixtures: shared mock `OllamaClient` from `conftest.py`. `pytest.mark.asyncio` is implicit (project uses `asyncio_mode=auto`).

```python
"""Behaviour pins for QwenLocalJudge.

Wraps the existing async OllamaClient. Forces JSON-shape verdicts.
1.5x RoI expansion before sending bytes upstream.
"""

import json
import pytest
from pipeline_service.eval.gt_eval.judges.qwen_local import QwenLocalJudge


async def test_prompt_body_includes_json_shape_and_label(
    mock_ollama_client,
) -> None:
    """Prompt must contain literal '{"verdict":' and the label string.

    Pins the JSON-mode demand and that the runtime-built prompt does NOT
    hardcode any item list (label is interpolated at call time).
    """
    judge = QwenLocalJudge(client=mock_ollama_client)
    await judge.verify(b"\xff\xd8\xff\xe0fake-jpeg", label="coffee table")
    prompt_sent = mock_ollama_client.last_call_kwargs["prompt"]
    assert '{"verdict":' in prompt_sent
    assert "coffee table" in prompt_sent


async def test_roi_expansion_is_1_5x(mock_ollama_client) -> None:
    """Crop bytes uploaded to Ollama must represent a 1.5x-expanded image.

    Approach: pass a known-size JPEG (e.g. 100x100). Mock-decode the
    bytes that QwenLocalJudge passed to ollama.generate and assert
    the decoded dimensions are 150x150 (within 1px rounding).

    The 1.5x ratio comes from roi_pad_frac=0.5 (default) which means
    pad each side by 0.5x the original extent.
    """
    ...


@pytest.mark.parametrize("verdict", ["yes", "no", "unsure"])
async def test_happy_path_returns_each_verdict(
    mock_ollama_client, verdict: str
) -> None:
    """Ollama -> {"verdict": V} must round-trip to V for V in {yes,no,unsure}."""
    mock_ollama_client.set_response(json.dumps({"verdict": verdict}))
    judge = QwenLocalJudge(client=mock_ollama_client)
    result = await judge.verify(b"jpeg", label="lamp")
    assert result == verdict


async def test_json_parse_failure_returns_unsure(mock_ollama_client) -> None:
    """Non-JSON response -> 'unsure'. MUST NOT raise."""
    mock_ollama_client.set_response("the answer is yes, definitely")
    judge = QwenLocalJudge(client=mock_ollama_client)
    result = await judge.verify(b"jpeg", label="lamp")
    assert result == "unsure"


async def test_malformed_verdict_returns_unsure(mock_ollama_client) -> None:
    """Valid JSON but unknown verdict value -> 'unsure'."""
    mock_ollama_client.set_response(json.dumps({"verdict": "maybe"}))
    judge = QwenLocalJudge(client=mock_ollama_client)
    result = await judge.verify(b"jpeg", label="lamp")
    assert result == "unsure"


async def test_keep_alive_60s_plumbed_to_ollama_generate(
    mock_ollama_client,
) -> None:
    """ollama.generate must be invoked with keep_alive='60s'.

    The judge keeps the 3B model warm during a hallucination batch.
    The 'final call' semantic (keep_alive=0 to release MPS) is the
    orchestrator's responsibility, not the judge's, per spec.
    """
    judge = QwenLocalJudge(client=mock_ollama_client)
    await judge.verify(b"jpeg", label="lamp")
    assert mock_ollama_client.last_call_kwargs["keep_alive"] == "60s"


async def test_ollama_timeout_returns_unsure(mock_ollama_client) -> None:
    """OllamaTimeout MUST be swallowed and returned as 'unsure'.

    Contract decision: timeouts are judge failures; the metric module
    counts them via the wrapper that called this judge. Returning
    'unsure' lets the metric's conservative null-out logic work
    uniformly without try/except in the metric layer.
    """
    mock_ollama_client.raise_on_call(TimeoutError("ollama timeout"))
    judge = QwenLocalJudge(client=mock_ollama_client)
    result = await judge.verify(b"jpeg", label="lamp")
    assert result == "unsure"
```

> Note: §01's `conftest.py` provides the `mock_ollama_client` fixture with `set_response`, `raise_on_call`, `last_call_kwargs`. If §01's mock does not yet expose these helpers, extend it there — do not introduce a separate mock in this section.

---

## Implementation

### `gt_eval/judges/protocol.py`

Defines the Protocol surface and the verdict literal. Imports kept minimal (stdlib only).

```python
"""ReferenceModelJudge Protocol — binary GT-overlap verifier.

A judge looks at a cropped region of a predicted detection and answers:
"is this region a {label}?" The verdict is consumed by the
hallucination metric to decide whether a no-GT-overlap prediction is
genuinely a hallucination (verdict='no') or a novel-but-correct
detection LVIS doesn't annotate (verdict='yes').

v1 ships QwenLocalJudge (Ollama). v2 will add cloud impls; the
Protocol is designed so the orchestrator does not change.
"""

from __future__ import annotations

from typing import Literal, Protocol, runtime_checkable


JudgeVerdict = Literal["yes", "no", "unsure"]


@runtime_checkable
class ReferenceModelJudge(Protocol):
    """Async binary classifier over (crop_jpeg_bytes, label)."""

    name: str
    """Stable identifier for this judge (e.g. 'qwen2.5vl:3b'). Logged
    into the run record so a baseline can be invalidated when the judge
    backend changes."""

    async def verify(self, crop_jpeg_bytes: bytes, label: str) -> JudgeVerdict:
        """Return a verdict in {'yes', 'no', 'unsure'}.

        MUST NOT raise on transport / parse failure: degrade to
        'unsure' so the caller's conservative null-out is uniform.
        """
        ...
```

### `gt_eval/judges/qwen_local.py`

Concrete v1 impl backed by the existing `pipeline_service.models.ollama_client.OllamaClient`. **Does not modify** the OllamaClient.

Key behaviours, all pinned by the tests above:

1. **Constructor signature**:
   ```python
   class QwenLocalJudge:
       name = "qwen2.5vl:3b"

       def __init__(
           self,
           client: OllamaClient | None = None,
           *,
           roi_pad_frac: float = 0.5,
           keep_alive: str = "60s",
           model: str = "qwen2.5vl:3b",
       ) -> None: ...
   ```
   - `client` defaults to a freshly-constructed `OllamaClient()` (production path).
   - `roi_pad_frac=0.5` produces a 1.5× expansion (pad each side by 0.5× the original extent).
   - `keep_alive` is plumbed straight through to `ollama.generate` to keep the model warm across a batch. The "final call sets `keep_alive=0`" semantic lives in the orchestrator (§08), not here.

2. **Prompt** — built at runtime, no hardcoded item list. The label is interpolated; the JSON shape is literal:
   ```python
   PROMPT_TEMPLATE = """\
   You are verifying a vision-model detection. Look at the cropped region.
   Is this region a {label}? Answer with JSON only:
     {{"verdict": "yes"}} if confident the region shows a {label},
     {{"verdict": "no"}} if it clearly is not,
     {{"verdict": "unsure"}} if you cannot tell.
   Do not include any other keys or commentary.
   """
   ```
   The literal substring `'{"verdict":'` MUST appear in the rendered prompt — the test asserts this directly. (Use `{{...}}` for the literal braces in `.format()`.)

3. **RoI expansion** — `_expand_crop(jpeg_bytes, pad_frac) -> bytes`:
   - Decode JPEG via Pillow (`PIL.Image.open(BytesIO(...))`); Pillow is already a transitive dep of the existing pipeline.
   - Compute new size: `(int(round(w * (1 + pad_frac))), int(round(h * (1 + pad_frac))))` — for `pad_frac=0.5`, this is 1.5×.
   - Resize via `Image.LANCZOS`.
   - Re-encode to JPEG; return bytes.
   - When the original image is smaller than expected (e.g. unit-test stub), do not raise — return as-is.

4. **`verify()` flow**:
   ```python
   async def verify(self, crop_jpeg_bytes: bytes, label: str) -> JudgeVerdict:
       expanded = self._expand_crop(crop_jpeg_bytes, self.roi_pad_frac)
       prompt = PROMPT_TEMPLATE.format(label=label)
       try:
           raw = await self.client.generate(
               model=self.model,
               prompt=prompt,
               images=[expanded],
               format="json",
               keep_alive=self.keep_alive,
           )
       except (TimeoutError, OllamaError, Exception):
           # Degrade to 'unsure'. NEVER raise out of verify().
           return "unsure"
       return self._parse_verdict(raw)
   ```
   - The `except Exception` catch-all is deliberate (per the test contract): any transport-layer surprise becomes `"unsure"`. Log at WARNING level with `label` and exception type so failure modes are diagnosable.
   - `format="json"` is the Ollama JSON-mode flag — forces structured output.

5. **`_parse_verdict(raw)`**:
   - Accept either a `dict`-shaped response or a JSON string. The existing `OllamaClient.generate` returns a dict-ish payload — extract `raw.get("response")` and `json.loads` it. If `raw` is already a dict with `"verdict"`, use that directly.
   - On `json.JSONDecodeError` or any `KeyError` / `TypeError` → return `"unsure"`.
   - If the parsed `verdict` is not in `{"yes", "no", "unsure"}` → return `"unsure"`.

6. **Logging** (per global rule §11):
   - INFO at `verify()` entry: `label`, `crop_size_bytes` (small payload).
   - WARNING on parse failure with `raw_response_snippet[:200]`.
   - WARNING on transport exception with `exc_type` and `label`.
   - Do NOT log the full crop bytes.

### `gt_eval/judges/__init__.py`

Re-export the public surface so callers write `from pipeline_service.eval.gt_eval.judges import QwenLocalJudge`:

```python
"""Reference-model judges for hallucination verification."""

from pipeline_service.eval.gt_eval.judges.protocol import (
    JudgeVerdict,
    ReferenceModelJudge,
)
from pipeline_service.eval.gt_eval.judges.qwen_local import QwenLocalJudge

__all__ = ["JudgeVerdict", "ReferenceModelJudge", "QwenLocalJudge"]
```

---

## Contract Notes (Pin These)

These decisions are pinned by tests in this section; do not relax them without a follow-up review:

| Contract | Decision | Rationale |
|---|---|---|
| Timeout / transport failure | `verify()` returns `"unsure"`, never raises | Lets the metric's conservative null-out logic work uniformly. Bookkeeping (`judge_failures` counter) lives in the metric module (§05), not here. |
| JSON parse failure | `verify()` returns `"unsure"` | Same uniformity argument; LLMs occasionally emit prose despite `format="json"`. |
| `keep_alive` final call | Orchestrator concern, NOT judge concern | The judge cannot know which call is final in a batch. §08 sets `keep_alive="0s"` on the last call to release MPS. |
| `name` attribute | `"qwen2.5vl:3b"` (stable string) | Stamped into the baseline; baseline invalidates when the judge backend changes. |
| Default `roi_pad_frac` | `0.5` (→ 1.5× expansion) | Matches the spec; provides surrounding context for borderline crops. |
| Prompt is runtime-built | No hardcoded item list, label interpolated | Open-vocab compatibility — any label, including ones not in LVIS. |

---

## Acceptance Checklist

An implementer is done with this section when:

- [ ] `pipeline_service/eval/gt_eval/judges/protocol.py` exists with `JudgeVerdict`, `ReferenceModelJudge` (`@runtime_checkable`).
- [ ] `pipeline_service/eval/gt_eval/judges/qwen_local.py` exists with `QwenLocalJudge` matching the contract above.
- [ ] `pipeline_service/eval/gt_eval/judges/__init__.py` re-exports the three names.
- [ ] `tests/unit/eval/test_judge_protocol.py` and `tests/unit/eval/test_qwen_local_judge.py` are written and pass.
- [ ] `uv run --project pipeline-service pytest tests/unit/eval/test_judge_protocol.py tests/unit/eval/test_qwen_local_judge.py -q` is green.
- [ ] `OllamaClient` is **not** modified — verify with `git diff pipeline_service/models/ollama_client.py` showing zero changes.
- [ ] Logging follows the global rule (INFO entry, WARNING on parse / transport failure, no crop bytes in logs).