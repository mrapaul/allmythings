"""Eval-rig entry point.

Section-01 ships this as a placeholder. Section-09 fills it in with the
real corpus runner that emits ``last-metrics.json`` and gates CI on
``thresholds.json``.
"""
from __future__ import annotations

import sys


def main() -> int:  # pragma: no cover — section-09 implements this
    print("eval/run_eval.py is a placeholder (section-09 implements this)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
