"""Protocol-shape pins for the ``ReferenceModelJudge`` surface.

Keeps v2 cloud-judge implementations honest about the contract:
binary verification of (crop_bytes, label) -> JudgeVerdict.
"""
from __future__ import annotations

import typing

from pipeline_service.eval.gt_eval.judges.protocol import (
    JudgeVerdict,
    ReferenceModelJudge,
)


def test_reference_model_judge_protocol_is_runtime_checkable() -> None:
    """A class with the right surface passes ``isinstance(x, ReferenceModelJudge)``."""

    class _OK:
        name = "test-judge"

        async def verify(self, crop_jpeg_bytes: bytes, label: str) -> JudgeVerdict:
            return "unsure"

    assert isinstance(_OK(), ReferenceModelJudge)


def test_judge_verdict_literal_accepts_only_three_values() -> None:
    """``JudgeVerdict`` is exactly ``Literal['yes', 'no', 'unsure']``."""
    args = typing.get_args(JudgeVerdict)
    assert set(args) == {"yes", "no", "unsure"}


def test_protocol_rejects_class_missing_verify() -> None:
    """A class without ``verify`` fails the runtime check."""

    class _Bad:
        name = "no-verify"

    assert not isinstance(_Bad(), ReferenceModelJudge)
