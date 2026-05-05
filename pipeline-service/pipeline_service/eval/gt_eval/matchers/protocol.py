"""LabelMatcher Protocol — pluggable label-equivalence strategy."""
from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class LabelMatcher(Protocol):
    """Decides whether a free-text predicted label refers to the same
    concept as a dataset GT category name.

    Implementations must be pure (no I/O during ``__call__``) once
    constructed. Construction-time I/O (loading aliases, encoders) is
    fine.
    """

    def __call__(self, predicted: str, gt_category: str) -> bool: ...
