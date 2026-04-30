"""§3.3 vlm_prompt_expansion — section-01 stub. Real impl in section-04."""
from __future__ import annotations

from pipeline_service.ops._stub import mark_stub
from pipeline_service.types import Frame, PromptList, SceneEmbedding


@mark_stub
def vlm_prompt_expansion_impl(
    frames: list[Frame],
    embeddings: list[SceneEmbedding],
) -> PromptList:
    return PromptList(prompts=[], cached=False, source_models=[], degraded=False)
