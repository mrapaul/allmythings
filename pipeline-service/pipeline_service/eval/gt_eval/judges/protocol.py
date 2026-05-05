"""ReferenceModelJudge Protocol — binary GT-overlap verifier.

A judge looks at a cropped region of a predicted detection and answers
"is this region a {label}?". The verdict is consumed by the
hallucination metric to decide whether a no-GT-overlap prediction is a
genuine hallucination (verdict='no') or a novel-but-correct detection
LVIS does not annotate (verdict='yes').

v1 ships ``QwenLocalJudge``. v2 will add cloud impls (GPT-4o, Claude,
Gemini); the Protocol is designed so the orchestrator does not change.
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
