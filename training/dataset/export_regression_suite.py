#!/usr/bin/env python3
"""Export fully-reviewed flywheel photos as regression eval candidates (Stage C).

Reads the corrections flywheel (`$PHOTO_DIR/flywheel/*.jsonl` by default — the
same source as `make dataset-export`), reconstructs per-photo verified truth,
and writes oracle-candidate JSONs in the eval/oracle format to
`datasets/regression-candidates/<photo_sha>.json` plus a `summary.json`.
It never touches eval/oracle/ itself; promoting a candidate into the oracle
stays a human decision (`make eval-promote`).

Truth reconstruction mirrors api-service/src/services/flywheel-coco.ts
(`verifiedItems`): events are applied in order to the latest record per photo
(latest receivedAt wins) — accept/relabel/add_box put an item into truth
(relabel applies newLabel/newTags), discard removes a previously-kept item
matched by label + normalized box, everything else is ignored.

Coverage heuristic (deliberately simple and conservative — a photo is only
emitted when every layer of review is present in its latest record):
  1. a photo_verdict event exists and its verdict is "ok" (a rejected scene —
     too_dark/too_blurry/too_far/not_a_scene — cannot yield complete truth);
  2. at least one item-level event (accept/relabel/discard/add_box), so the
     user adjudicated items, not just the photo; and
  3. the reconstructed truth is non-empty — an all-discard photo is a
     perfectly reviewed photo, but an auto-emitted empty oracle would be a
     strong suppression claim, so it goes to the human-review queue instead.

Anything reviewed that fails a check lands in the summary's needsHumanReview
list with the failing reason. Item-count bounds follow the hand-written
oracles' slack (~60% floor / ~130% cap): min = ceil(0.6 * n) (min 1),
max = ceil(1.3 * n) + 1.

Usage: python3 training/dataset/export_regression_suite.py [--flywheel PATH]
       [--out DIR] [--summary PATH]
"""

from __future__ import annotations

import argparse
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO_ROOT / "datasets" / "regression-candidates"
ITEM_EVENTS = ("accept", "relabel", "discard", "add_box")


def resolve_flywheel(arg: str | None) -> Path:
    """Accept a jsonl file, the flywheel dir, or the photo dir above it."""
    if arg:
        p = Path(arg).expanduser()
        if p.is_dir() and (p / "flywheel").is_dir():
            return p / "flywheel"
        return p
    photo_dir = Path(os.environ.get("PHOTO_DIR", str(Path.home() / "allmythings-data")))
    return photo_dir / "flywheel"


def load_records(flywheel: Path) -> tuple[list[dict], int]:
    """All records across every *.jsonl, plus the unparseable-line count."""
    files = [flywheel] if flywheel.is_file() else sorted(flywheel.glob("*.jsonl"))
    records: list[dict] = []
    bad_lines = 0
    for f in files:
        for line in f.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                records.append(json.loads(line))
            except ValueError:
                bad_lines += 1
    return records, bad_lines


def latest_record_per_photo(records: list[dict]) -> dict[str, dict]:
    """The user may re-review a photo; only the latest verdict set counts."""
    by_photo: dict[str, dict] = {}
    for rec in records:
        sha = rec.get("photoSha256")
        if not sha:
            continue
        prev = by_photo.get(sha)
        if prev is None or rec.get("receivedAt", "") >= prev.get("receivedAt", ""):
            by_photo[sha] = rec
    return by_photo


def item_key(item: dict) -> tuple:
    box = item.get("box") or {}
    return (
        str(item.get("label", "")).strip().lower(),
        round(float(box.get("x", 0)), 3),
        round(float(box.get("y", 0)), 3),
        round(float(box.get("width", 0)), 3),
        round(float(box.get("height", 0)), 3),
    )


def reconstruct_truth(record: dict) -> list[dict]:
    """Verified items of one record: accept/relabel/add_box keep (relabel with
    its corrected label), discard removes a kept item with the same label+box."""
    truth: list[dict] = []
    for ev in record.get("events", []):
        kind = ev.get("type")
        if kind in ("accept", "add_box"):
            truth.append(ev["item"])
        elif kind == "relabel":
            item = dict(ev["item"])
            item["label"] = ev["newLabel"]
            item["tags"] = list(ev.get("newTags", []))
            truth.append(item)
        elif kind == "discard":
            key = item_key(ev.get("item") or {})
            for i, kept in enumerate(truth):
                if item_key(kept) == key:
                    del truth[i]
                    break
    return truth


def coverage_reason(record: dict, truth: list[dict]) -> str | None:
    """None when the photo is completely reviewed, else the failing check."""
    verdicts = [ev for ev in record.get("events", []) if ev.get("type") == "photo_verdict"]
    if not verdicts:
        return "no_photo_verdict"
    if verdicts[-1].get("verdict") != "ok":
        return "scene_not_ok"
    if not any(ev.get("type") in ITEM_EVENTS for ev in record.get("events", [])):
        return "no_item_events"
    if not truth:
        return "empty_truth"
    return None


def build_oracle(truth: list[dict]) -> dict:
    """eval/oracle-format candidate; bounds mirror the hand-written slack."""
    n = len(truth)
    expected = sorted(({"label": str(it.get("label", "")).strip()} for it in truth),
                      key=lambda e: e["label"])
    return {
        "expected_items": expected,
        "min_item_count": max(1, math.ceil(n * 0.6)),
        "max_item_count": math.ceil(n * 1.3) + 1,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--flywheel", help="flywheel dir, photo dir, or .jsonl file "
                        "(default: $PHOTO_DIR/flywheel)")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT,
                        help="candidate output dir (default: %(default)s)")
    parser.add_argument("--summary", type=Path, default=None,
                        help="summary path (default: <out>/summary.json)")
    args = parser.parse_args(argv)

    flywheel = resolve_flywheel(args.flywheel)
    if not flywheel.exists():
        print(f"No flywheel at {flywheel} — nothing to export.")
        return 1

    records, bad_lines = load_records(flywheel)
    latest = latest_record_per_photo(records)

    args.out.mkdir(parents=True, exist_ok=True)
    emitted: list[dict] = []
    needs_review: list[dict] = []
    for sha, rec in sorted(latest.items()):
        truth = reconstruct_truth(rec)
        reason = coverage_reason(rec, truth)
        if reason is None:
            oracle = build_oracle(truth)
            (args.out / f"{sha}.json").write_text(
                json.dumps(oracle, indent=2) + "\n", encoding="utf-8")
            emitted.append({"sha": sha, **oracle})
        else:
            needs_review.append({"sha": sha, "reason": reason})

    summary = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "flywheel": str(flywheel),
        "outDir": str(args.out),
        "recordsRead": len(records),
        "unparseableLinesSkipped": bad_lines,
        "photosReviewed": len(latest),
        "candidatesEmitted": len(emitted),
        "candidatesNeedingHumanReview": len(needs_review),
        "needsHumanReview": needs_review,
    }
    summary_path = args.summary or (args.out / "summary.json")
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    print(f"Flywheel source:           {flywheel}")
    print(f"Records read:              {len(records)} ({bad_lines} unparseable lines skipped)")
    print(f"Photos reviewed:           {len(latest)}")
    print(f"Candidates emitted:        {len(emitted)}")
    print(f"Needing human review:      {len(needs_review)}")
    print(f"Output:                    {args.out}")
    print(f"Summary:                   {summary_path}")
    print("eval/oracle/ untouched — promote by hand (make eval-promote) after review.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
