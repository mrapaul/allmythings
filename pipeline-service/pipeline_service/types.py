"""Pydantic mirrors of the TypeScript wire types in
``api-service/src/types/pipeline.ts`` (§5.1 of claude-plan.md).

Types whose names are camelCase on the wire are kept camelCase here; the
serialised JSON is consumed by Fastify and the Flutter mobile, both of
which expect camelCase.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Optional

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

# ----- string-ID aliases ------------------------------------------------------

FrameId = str
RunId = str
SceneId = str
DetectionId = str

DetectorName = Literal["florence", "gdino", "gdino-sahi"]
FlagReason = Literal[
    "empty_detection_set",
    "single_source_run",
    "diagnosis_budget_exhausted",
    "assemble_failed",
]


# ----- shared sub-shapes ------------------------------------------------------

class BBox(BaseModel):
    model_config = ConfigDict(frozen=False, populate_by_name=True)

    x: float
    y: float
    width: float
    height: float


class ContributingSignal(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    detector: DetectorName
    frameId: FrameId = Field(alias="frameId")
    rawConfidence: Optional[float] = Field(default=None, alias="rawConfidence")


class TileError(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    tileIndex: int = Field(alias="tileIndex")
    code: str
    message: str


class AlternateLabel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    label: str
    confidence: float


# ----- threshold + detector config -------------------------------------------

class Thresholds(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    detectionConfidenceMin: float = 0.30
    sahiTriggerDensity: float = 5.0
    crossPassEmbeddingTheta: float = 0.88
    crossFrameEmbeddingTheta: float = 0.85
    labelTextCompatTheta: float = 0.6
    agreementCoverageMin: float = 0.70
    agreementPrecisionMin: float = 0.40
    maxReruns: int = 2


class DetectorWeights(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    florence: float = 0.5
    gdino: float = 1.0
    gdino_sahi: float = Field(default=0.8, alias="gdino-sahi")


class BoxFusionConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    iouThr: float = 0.5
    skipBoxThr: float = 0.0
    detectorWeights: DetectorWeights = Field(default_factory=DetectorWeights)


class PipelineConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    thresholds: Thresholds = Field(default_factory=Thresholds)
    enabledDetectors: list[DetectorName] = Field(
        default_factory=lambda: ["florence", "gdino", "gdino-sahi"]
    )
    classificationTierForcing: Optional[Literal["qwen7b", "qwen3b", "moondream"]] = None
    boxFusion: BoxFusionConfig = Field(default_factory=BoxFusionConfig)


# ----- internal-only op-input types (Python side, not on the wire) ------------

class Frame(BaseModel):
    """The post-decode in-memory frame.

    ``rgb`` is held as raw bytes in this Pydantic shape because Pydantic v2
    does not natively serialise NumPy arrays. Section-01 ops never need the
    pixels (stub ops ignore content), but we keep the shape information so
    downstream sections can reconstruct the array.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    frame_id: FrameId
    rgb_bytes: bytes
    rgb_shape: tuple[int, int, int]
    rgb_dtype: str = "uint8"
    exif_orientation: int = 1
    captured_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    decoding_failed: bool = False

    def to_array(self) -> "np.ndarray":
        if self.decoding_failed:
            return np.zeros(self.rgb_shape, dtype=self.rgb_dtype)
        return np.frombuffer(self.rgb_bytes, dtype=self.rgb_dtype).reshape(
            self.rgb_shape
        )


class SceneEmbedding(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    frame_id: FrameId
    vector_bytes: bytes  # f16 bytes; 768*2 = 1536 bytes when populated
    embedded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    embedding_failed: bool = False


class PromptList(BaseModel):
    prompts: list[str] = Field(default_factory=list)
    cached: bool = False
    source_models: list[str] = Field(default_factory=list)
    degraded: bool = False


class RawDetection(BaseModel):
    detector: DetectorName
    frame_id: FrameId
    bbox: BBox
    label: str
    raw_confidence: Optional[float] = None


class FrameDetections(BaseModel):
    detector: DetectorName
    frame_id: FrameId
    detections: list[RawDetection] = Field(default_factory=list)
    detector_error: bool = False
    tile_errors: list[TileError] = Field(default_factory=list)


class FusedDetection(BaseModel):
    detection_id: DetectionId
    frame_id: FrameId
    bbox: BBox
    primary_label: str
    alternates: list[tuple[str, float]] = Field(default_factory=list)
    contributing_signals: list[ContributingSignal] = Field(default_factory=list)


class FusedFrame(BaseModel):
    frame_id: FrameId
    fused: list[FusedDetection] = Field(default_factory=list)


class EmbeddedFrame(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    frame_id: FrameId
    # detection_id -> raw f16 bytes (768 * 2 bytes when populated).
    embeddings: dict[DetectionId, bytes] = Field(default_factory=dict)


class DedupedFrame(BaseModel):
    frame_id: FrameId
    detections: list[FusedDetection] = Field(default_factory=list)


# ----- on-the-wire SceneObservation + PipelineDetection -----------------------

class PipelineDetection(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: DetectionId
    bbox: BBox
    maskRleB64: Optional[str] = None
    cropEmbeddingB64: Optional[str] = None
    primaryLabel: str
    alternateLabels: list[AlternateLabel] = Field(default_factory=list)
    vlmStructuredAttributes: dict[str, Any] = Field(default_factory=dict)
    agreementScore: float = 0.0
    contributingSignals: list[ContributingSignal] = Field(default_factory=list)
    confidence: float = 0.0


class OpError(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    op: str
    code: str
    message: str


class SceneObservation(BaseModel):
    """The scene-level result returned by ``assemble_result`` and shipped over
    the wire to Fastify (then to the mobile)."""

    model_config = ConfigDict(populate_by_name=True)

    sceneId: SceneId
    runId: RunId
    frameIds: list[FrameId] = Field(default_factory=list)
    detections: list[PipelineDetection] = Field(default_factory=list)
    agreementCoverage: float = 0.0
    agreementPrecision: float = 0.0
    selfDiagnosisTriggered: bool = False
    rerunDepth: int = 0
    flagged: bool = False
    flagReason: Optional[str] = None
    processingMs: int = 0
    errors: list[OpError] = Field(default_factory=list)
    tileErrors: list[TileError] = Field(default_factory=list)

    # -- factories used by ops + tests -----------------------------------------

    @classmethod
    def empty(
        cls,
        scene_id: SceneId,
        run_id: RunId,
        frame_ids: list[FrameId],
    ) -> "SceneObservation":
        return cls(sceneId=scene_id, runId=run_id, frameIds=list(frame_ids))

    def with_tile_errors(self, errors: list[TileError]) -> "SceneObservation":
        return self.model_copy(update={"tileErrors": list(errors)})

    def with_errors(self, errors: list[dict[str, str] | OpError]) -> "SceneObservation":
        normalised = [
            e if isinstance(e, OpError) else OpError(**e)
            for e in errors
        ]
        return self.model_copy(update={"errors": normalised})


# ----- self-diagnosis directive (used in section-07) --------------------------

class RerunDirective(BaseModel):
    next_depth: int
    strictness_level: int
    overrides: PipelineConfig
    reason: Literal["empty_detection_set", "low_coverage", "single_source_run"]


# ----- HTTP-status types ------------------------------------------------------

class RunStatus(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    run_id: RunId
    status: Literal["running", "succeeded", "failed", "cancelled", "timed_out"]
    started_at: str
    finished_at: Optional[str] = None
    result: Optional[SceneObservation] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
