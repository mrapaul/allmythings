"""gt_eval.matchers — pluggable label/box matching primitives."""
from pipeline_service.eval.gt_eval.matchers.iou import Match, match_boxes
from pipeline_service.eval.gt_eval.matchers.label_cosine import CosineLabelMatcher
from pipeline_service.eval.gt_eval.matchers.protocol import LabelMatcher

__all__ = [
    "CosineLabelMatcher",
    "LabelMatcher",
    "Match",
    "match_boxes",
]
