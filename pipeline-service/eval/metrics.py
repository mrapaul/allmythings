"""Top-level shim — re-export from ``pipeline_service.eval.metrics``."""
from __future__ import annotations

from pipeline_service.eval.metrics import (  # noqa: F401
    agreement_coverage_avg,
    agreement_precision_avg,
    empty_detection_set_rate,
    multi_frame_stability,
    op_failure_rate,
    self_diagnosis_trigger_rate,
    single_source_run_rate,
)
