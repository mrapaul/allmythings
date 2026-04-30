"""Top-level CLI shim — delegates to ``pipeline_service.eval.run_eval``.

Section-01 created this as a placeholder; section-09 now wires the real
runner. The structure test expects this file at the top level of
``pipeline-service/``; the implementation lives inside the package so
imports resolve cleanly under uv/hatch.
"""
from __future__ import annotations

from pipeline_service.eval.run_eval import main  # noqa: F401  re-export


if __name__ == "__main__":
    raise SystemExit(main())
