"""Pydantic v2 wire shapes for the FastAPI sidecar (§4.2).

Wire fields are snake_case (matching the TypeScript contract in
``api-service/src/types/pipeline.ts``); SceneObservation fields stay
camelCase (matching its existing TS shape).
"""
from __future__ import annotations

import re
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from pipeline_service.types import PipelineConfig, SceneObservation


_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


class LaunchRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    idempotency_key: str = Field(
        ..., description="sha256 of concatenated frame hashes (64 lowercase hex)"
    )
    photo_paths: list[str] = Field(
        ..., min_length=1, description="Server-local paths to frame bytes"
    )
    trace_id: str
    request_id: str
    config: Optional[PipelineConfig] = None

    @field_validator("idempotency_key")
    @classmethod
    def _validate_sha256(cls, v: str) -> str:
        if not _SHA256_RE.match(v):
            raise ValueError("idempotency_key must be 64 lowercase hex characters")
        return v


class LaunchRunResponse202(BaseModel):
    run_id: str
    started_at: str
    idempotent_hit: Literal[False] = False


class LaunchRunResponse200(BaseModel):
    run_id: str
    started_at: str
    idempotent_hit: Literal[True] = True
    status: Literal["running", "succeeded"]
    result: Optional[SceneObservation] = None


class QueueFullResponse503(BaseModel):
    error: Literal["queue_full"] = "queue_full"
    queue_depth: int
    retry_after_s: int


class GetRunResponse(BaseModel):
    run_id: str
    status: Literal["running", "succeeded", "failed", "cancelled", "timed_out"]
    started_at: str
    finished_at: Optional[str] = None
    result: Optional[SceneObservation] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None


class TimelineOp(BaseModel):
    name: str
    status: Literal["running", "succeeded", "failed", "skipped"]
    started_at: Optional[str] = None
    duration_ms: int = 0
    retry_count: int = 0
    dynamic_outputs: int = 0


class TimelineResponse(BaseModel):
    run_id: str
    ops: list[TimelineOp]


class HealthResponse(BaseModel):
    ready: bool
    model_warmup_complete: bool
    dagster_home: str
    queue_depth: int
    max_queue_depth: int
    florence_reachable: bool
    ollama_reachable: bool
    grounding_dino_loaded: bool
