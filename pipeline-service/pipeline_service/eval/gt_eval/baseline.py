"""Baseline read / write / diff for the GT-eval harness.

This module persists, diffs, and gates the per-run ``GtMetricsBlock``
against a committed baseline. It is the only consumer of the
``HeadlineMetrics`` shape produced by §05's metric modules and the only
producer of the diff/commit decisions consumed by §08's
``run_eval.py``.

It deliberately does NOT read environment variables: the
``autocommit_enabled`` flag arrives as a parameter so the module is
testable without env mutation.

Public surface:
    * Data shapes: ``HeadlineMetrics``, ``CategoryAP``,
      ``GtMetricsBlock``, ``Stamps``.
    * Diff types: ``MetricDelta``, ``MetricFloor``, ``BaselineDiff``.
    * Entry points: ``diff_and_check``, ``maybe_commit_baseline``.
"""
from __future__ import annotations

import dataclasses
import json
import logging
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


_HIGHER_IS_BETTER = (
    "class_aware_map_50_95",
    "class_aware_map_50",
    "class_agnostic_map_50_95",
    "class_agnostic_map_50",
    "label_f1",
    "box_f1_50",
    "novel_likely_correct",
)
_LOWER_IS_BETTER = ("hallucination_rate",)
_INFORMATIONAL = ("judge_unsure",)

_FLOOR_MAP = {
    "class_aware_map_50_95_min": ("class_aware_map_50_95", "min"),
    "class_agnostic_map_50_95_min": ("class_agnostic_map_50_95", "min"),
    "label_f1_min": ("label_f1", "min"),
    "hallucination_rate_max": ("hallucination_rate", "max"),
}


# ---------- Data shapes ----------------------------------------------------


@dataclass(frozen=True)
class HeadlineMetrics:
    """The headline metrics block written into ``baseline.json``."""

    class_aware_map_50_95: float
    class_aware_map_50: float
    class_agnostic_map_50_95: float
    class_agnostic_map_50: float
    label_f1: float
    box_f1_50: float
    hallucination_rate: Optional[float]
    novel_likely_correct: int
    judge_unsure: int


@dataclass(frozen=True)
class CategoryAP:
    category: str
    ap: float


@dataclass(frozen=True)
class GtMetricsBlock:
    """The complete GT-metrics block persisted in ``baseline.json``."""

    headline: HeadlineMetrics
    per_class_top10: list[CategoryAP] = field(default_factory=list)
    per_class_bottom10: list[CategoryAP] = field(default_factory=list)
    n_images: int = 0
    n_predictions: int = 0
    n_ground_truths: int = 0
    runtime_s: float = 0.0


@dataclass(frozen=True)
class Stamps:
    """Reproducibility stamps written alongside ``gt_metrics``."""

    lvis_dataset_sha256: str
    label_encoder_model_id: str
    python_version: str
    created_at: str  # ISO-8601 UTC, suffix "Z"


# ---------- Diff types -----------------------------------------------------


@dataclass(frozen=True)
class MetricDelta:
    metric: str
    current: float
    baseline: float
    delta: float


@dataclass(frozen=True)
class MetricFloor:
    metric: str
    current: float
    floor: float


@dataclass(frozen=True)
class BaselineDiff:
    regressions: list[MetricDelta] = field(default_factory=list)
    improvements: list[MetricDelta] = field(default_factory=list)
    floor_violations: list[MetricFloor] = field(default_factory=list)
    baseline_age_days: int = 0
    version_mismatch: bool = False
    baseline_committed: bool = False


# ---------- Helpers --------------------------------------------------------


def _round_value(value: Any) -> Any:
    if isinstance(value, float):
        return round(value, 3)
    return value


def _round_headline(headline: HeadlineMetrics) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for f in dataclasses.fields(headline):
        v = getattr(headline, f.name)
        if v is None:
            out[f.name] = None
        elif f.name in ("novel_likely_correct", "judge_unsure"):
            out[f.name] = int(v)
        elif isinstance(v, float):
            out[f.name] = round(v, 3)
        else:
            out[f.name] = v
    return out


def _round_per_category(items: list[CategoryAP]) -> list[dict[str, Any]]:
    return [
        {"category": str(it.category), "ap": round(float(it.ap), 3)}
        for it in items
    ]


def _serialise_block(block: GtMetricsBlock) -> dict[str, Any]:
    return {
        "headline": _round_headline(block.headline),
        "per_class_top10": _round_per_category(block.per_class_top10),
        "per_class_bottom10": _round_per_category(block.per_class_bottom10),
        "n_images": int(block.n_images),
        "n_predictions": int(block.n_predictions),
        "n_ground_truths": int(block.n_ground_truths),
        "runtime_s": round(float(block.runtime_s), 3),
    }


def _serialise_stamps(stamps: Stamps) -> dict[str, Any]:
    return {
        "lvis_dataset_sha256": stamps.lvis_dataset_sha256,
        "label_encoder_model_id": stamps.label_encoder_model_id,
        "python_version": stamps.python_version,
        "created_at": stamps.created_at,
    }


def _load_baseline(path: Path) -> Optional[dict[str, Any]]:
    """Return the parsed baseline dict, or ``None`` on missing/malformed."""
    if not path.exists():
        return None
    try:
        text = path.read_text(encoding="utf-8")
        return json.loads(text)
    except json.JSONDecodeError as exc:
        logger.warning(
            "baseline file %s is malformed JSON (%s); treating as missing.",
            path,
            exc,
        )
        return None
    except OSError as exc:
        logger.warning("baseline file %s unreadable (%s); treating as missing.", path, exc)
        return None


def _load_thresholds(path: Path) -> dict[str, Any]:
    """Load thresholds.json. Malformed JSON re-raises (per §08 contract)."""
    if not path.exists():
        return {}
    text = path.read_text(encoding="utf-8")
    return json.loads(text)


def _baseline_stamps(payload: dict[str, Any]) -> Optional[dict[str, Any]]:
    return payload.get("stamps") if isinstance(payload, dict) else None


def _baseline_gt_metrics(payload: dict[str, Any]) -> Optional[dict[str, Any]]:
    if not isinstance(payload, dict):
        return None
    block = payload.get("gt_metrics")
    return block if isinstance(block, dict) else None


def _stamps_match(disk: dict[str, Any], current: Stamps) -> bool:
    return (
        str(disk.get("lvis_dataset_sha256", "")) == current.lvis_dataset_sha256
        and str(disk.get("label_encoder_model_id", "")) == current.label_encoder_model_id
        and str(disk.get("python_version", "")) == current.python_version
    )


def _parse_iso(text: str) -> Optional[datetime]:
    if not isinstance(text, str) or not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def _compute_floor_violations(
    headline: HeadlineMetrics, thresholds: dict[str, Any]
) -> list[MetricFloor]:
    gating = thresholds.get("gating", {}) if isinstance(thresholds, dict) else {}
    out: list[MetricFloor] = []
    for floor_key, (metric_name, kind) in _FLOOR_MAP.items():
        if floor_key not in gating:
            continue
        try:
            floor = float(gating[floor_key])
        except (TypeError, ValueError):
            continue
        current = getattr(headline, metric_name)
        if current is None:
            continue
        try:
            current_f = float(current)
        except (TypeError, ValueError):
            continue
        if kind == "min" and current_f < floor:
            out.append(MetricFloor(metric=metric_name, current=current_f, floor=floor))
        elif kind == "max" and current_f > floor:
            out.append(MetricFloor(metric=metric_name, current=current_f, floor=floor))
    return out


def _diff_headlines(
    current: HeadlineMetrics, baseline_dict: dict[str, Any]
) -> tuple[list[MetricDelta], list[MetricDelta]]:
    regressions: list[MetricDelta] = []
    improvements: list[MetricDelta] = []
    baseline_headline = baseline_dict.get("headline", {})
    if not isinstance(baseline_headline, dict):
        return regressions, improvements

    for key in _HIGHER_IS_BETTER:
        if key not in baseline_headline:
            continue
        cur = getattr(current, key, None)
        base = baseline_headline[key]
        if cur is None or base is None:
            continue
        try:
            delta = float(cur) - float(base)
        except (TypeError, ValueError):
            continue
        if delta < 0:
            regressions.append(
                MetricDelta(metric=key, current=float(cur), baseline=float(base), delta=delta)
            )
        elif delta > 0:
            improvements.append(
                MetricDelta(metric=key, current=float(cur), baseline=float(base), delta=delta)
            )

    for key in _LOWER_IS_BETTER:
        if key not in baseline_headline:
            continue
        cur = getattr(current, key, None)
        base = baseline_headline[key]
        if cur is None or base is None:
            continue
        try:
            delta = float(cur) - float(base)
        except (TypeError, ValueError):
            continue
        if delta > 0:
            regressions.append(
                MetricDelta(metric=key, current=float(cur), baseline=float(base), delta=delta)
            )
        elif delta < 0:
            improvements.append(
                MetricDelta(metric=key, current=float(cur), baseline=float(base), delta=delta)
            )

    _ = _INFORMATIONAL
    return regressions, improvements


def _baseline_age_days(baseline_payload: dict[str, Any], now: datetime) -> int:
    stamps = _baseline_stamps(baseline_payload)
    if not stamps:
        return 0
    created = _parse_iso(str(stamps.get("created_at", "")))
    if created is None:
        return 0
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    delta = now - created
    return max(0, delta.days)


# ---------- Entry points ---------------------------------------------------


def diff_and_check(
    current: GtMetricsBlock,
    baseline_path: Path,
    thresholds_path: Path,
    *,
    current_stamps: Stamps,
    now: Optional[datetime] = None,
) -> BaselineDiff:
    """Load baseline + thresholds; produce a ``BaselineDiff`` for ``current``."""
    if now is None:
        now = datetime.now(timezone.utc)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    thresholds = _load_thresholds(thresholds_path)
    floor_violations = _compute_floor_violations(current.headline, thresholds)

    baseline_payload = _load_baseline(baseline_path)
    if baseline_payload is None:
        return BaselineDiff(
            regressions=[],
            improvements=[],
            floor_violations=floor_violations,
            baseline_age_days=0,
            version_mismatch=False,
        )

    gt_block = _baseline_gt_metrics(baseline_payload)
    if gt_block is None:
        return BaselineDiff(
            regressions=[],
            improvements=[],
            floor_violations=floor_violations,
            baseline_age_days=0,
            version_mismatch=False,
        )

    disk_stamps = _baseline_stamps(baseline_payload) or {}
    if not _stamps_match(disk_stamps, current_stamps):
        return BaselineDiff(
            regressions=[],
            improvements=[],
            floor_violations=floor_violations,
            baseline_age_days=0,
            version_mismatch=True,
        )

    regressions, improvements = _diff_headlines(current.headline, gt_block)
    return BaselineDiff(
        regressions=regressions,
        improvements=improvements,
        floor_violations=floor_violations,
        baseline_age_days=_baseline_age_days(baseline_payload, now),
        version_mismatch=False,
    )


def maybe_commit_baseline(
    diff: BaselineDiff,
    current: GtMetricsBlock,
    baseline_path: Path,
    autocommit_enabled: bool,
    *,
    current_stamps: Stamps,
) -> bool:
    """Write a fresh baseline iff every gate passes. Return True on write."""
    if not autocommit_enabled:
        _ = replace(diff, baseline_committed=False)
        return False
    if diff.regressions:
        return False
    if diff.floor_violations:
        return False
    if diff.version_mismatch:
        # Bootstrap: only allow when there is no prior baseline at all.
        if baseline_path.exists():
            return False

    existing_payload: dict[str, Any] = {}
    if baseline_path.exists():
        loaded = _load_baseline(baseline_path)
        if isinstance(loaded, dict):
            existing_payload = loaded

    new_payload = dict(existing_payload)
    new_payload["gt_metrics"] = _serialise_block(current)
    new_payload["stamps"] = _serialise_stamps(current_stamps)

    baseline_path.parent.mkdir(parents=True, exist_ok=True)
    baseline_path.write_text(
        json.dumps(new_payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return True


__all__ = [
    "BaselineDiff",
    "CategoryAP",
    "GtMetricsBlock",
    "HeadlineMetrics",
    "MetricDelta",
    "MetricFloor",
    "Stamps",
    "diff_and_check",
    "maybe_commit_baseline",
]
