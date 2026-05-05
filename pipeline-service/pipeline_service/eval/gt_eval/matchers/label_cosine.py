"""CosineLabelMatcher — embedding-cosine label equivalence.

Strategy:
  1. Identical-string short-circuit (post-normalisation).
  2. Alias-map override (``lvis_aliases.json``, owned by §02).
  3. Sentence-transformer cosine vs ``threshold``.

Encoder failure (any exception from ``encode``) returns ``True`` —
mirrors production ``label_text_compat`` (§3.11). Rationale: a sick
encoder must not silently downgrade detection-quality metrics by
blocking matches.
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Optional

import numpy as np

from pipeline_service.eval.gt_eval.matchers.protocol import LabelMatcher  # noqa: F401
from pipeline_service.models.label_encoder import LabelEncoder

logger = logging.getLogger(__name__)


_DEFAULT_ALIASES_PATH = (
    Path(__file__).parent.parent / "datasets" / "lvis_aliases.json"
)
_WS_RE = re.compile(r"\s+")


class CosineLabelMatcher:
    """Default ``LabelMatcher``: short-circuit, then alias map, then cosine."""

    def __init__(
        self,
        encoder: Optional[LabelEncoder] = None,
        threshold: float = 0.6,
        aliases_path: Optional[Path] = None,
    ) -> None:
        self._encoder = encoder if encoder is not None else LabelEncoder()
        self._threshold = float(threshold)
        self._aliases = self._load_aliases(aliases_path or _DEFAULT_ALIASES_PATH)

    @staticmethod
    def _load_aliases(path: Path) -> dict[str, set[str]]:
        """Load ``lvis_aliases.json``. Missing or malformed -> empty map."""
        try:
            with path.open("r", encoding="utf-8") as f:
                raw = json.load(f)
        except FileNotFoundError:
            return {}
        except (OSError, ValueError) as exc:
            logger.warning(
                "Failed to load aliases file %s: %s — treating as empty.",
                path,
                exc,
            )
            return {}

        result: dict[str, set[str]] = {}
        if not isinstance(raw, dict):
            logger.warning(
                "Aliases file %s has unexpected top-level type %s — treating as empty.",
                path,
                type(raw).__name__,
            )
            return {}
        for key, value in raw.items():
            norm_key = CosineLabelMatcher._normalise(str(key))
            if isinstance(value, str):
                values = [value]
            elif isinstance(value, (list, tuple, set)):
                values = list(value)
            else:
                logger.warning(
                    "Alias entry for %r has unexpected value type %s — skipping.",
                    key,
                    type(value).__name__,
                )
                continue
            result[norm_key] = {
                CosineLabelMatcher._normalise(str(v)) for v in values
            }
        return result

    @staticmethod
    def _normalise(text: str) -> str:
        """lowercase, strip, underscores -> space, collapse whitespace."""
        s = text.strip().lower().replace("_", " ")
        return _WS_RE.sub(" ", s).strip()

    def __call__(self, predicted: str, gt_category: str) -> bool:
        norm_pred = self._normalise(predicted)
        norm_gt = self._normalise(gt_category)
        if not norm_pred or not norm_gt:
            return False
        if norm_pred == norm_gt:
            return True

        alias_targets = self._aliases.get(norm_pred)
        if alias_targets is not None and norm_gt in alias_targets:
            return True

        try:
            v_pred = self._encoder.encode(norm_pred)
            v_gt = self._encoder.encode(norm_gt)
        except Exception as exc:  # noqa: BLE001 — degraded path
            logger.warning(
                "Label encoder failure on (%r, %r): %s — degrading to True.",
                norm_pred,
                norm_gt,
                exc,
            )
            return True

        denom = float(np.linalg.norm(v_pred) * np.linalg.norm(v_gt)) + 1e-9
        cos = float(np.dot(v_pred, v_gt) / denom)
        return cos >= self._threshold
