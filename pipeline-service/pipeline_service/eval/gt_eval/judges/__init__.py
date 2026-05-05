"""gt_eval.judges — reference-model judges for hallucination verification."""
from pipeline_service.eval.gt_eval.judges.protocol import (
    JudgeVerdict,
    ReferenceModelJudge,
)
from pipeline_service.eval.gt_eval.judges.qwen_local import QwenLocalJudge

__all__ = ["JudgeVerdict", "QwenLocalJudge", "ReferenceModelJudge"]
