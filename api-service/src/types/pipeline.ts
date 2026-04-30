// Wire types for the Fastify ↔ pipeline-service boundary.
// Mirrors pipeline-service/pipeline_service/types.py — see §5.1 of
// docs/superpowers/plans/claude-plan.md.

export type FrameId = string;
export type RunId = string;
export type SceneId = string;
export type DetectionId = string;

export interface PipelineConfig {
  thresholds: {
    detectionConfidenceMin: number;
    sahiTriggerDensity: number;
    crossPassEmbeddingTheta: number; // default 0.88
    crossFrameEmbeddingTheta: number; // default 0.85
    labelTextCompatTheta: number; // default 0.6
    agreementCoverageMin: number; // default 0.70
    agreementPrecisionMin: number; // default 0.40
    maxReruns: number; // default 2
  };
  enabledDetectors: ('florence' | 'gdino' | 'gdino-sahi')[];
  classificationTierForcing?: 'qwen7b' | 'qwen3b' | 'moondream';
  boxFusion: {
    iouThr: number; // default 0.5
    skipBoxThr: number; // default 0.0
    detectorWeights: { florence: number; gdino: number; 'gdino-sahi': number };
  };
}

export interface ContributingSignal {
  detector: 'florence' | 'gdino' | 'gdino-sahi';
  frameId: FrameId;
  rawConfidence: number | null;
}

export interface TileError {
  tileIndex: number;
  code: string;
  message: string;
}

export interface PipelineDetection {
  id: DetectionId;
  bbox: { x: number; y: number; width: number; height: number };
  maskRleB64?: string;
  cropEmbeddingB64?: string;
  primaryLabel: string;
  alternateLabels: { label: string; confidence: number }[];
  vlmStructuredAttributes: Record<string, unknown>;
  agreementScore: number;
  contributingSignals: ContributingSignal[];
  confidence: number;
}

export interface SceneObservation {
  sceneId: SceneId;
  runId: RunId;
  frameIds: FrameId[];
  detections: PipelineDetection[];
  agreementCoverage: number;
  agreementPrecision: number;
  selfDiagnosisTriggered: boolean;
  rerunDepth: number;
  flagged: boolean;
  flagReason?:
    | 'empty_detection_set'
    | 'single_source_run'
    | 'diagnosis_budget_exhausted'
    | 'assemble_failed'
    | string;
  processingMs: number;
  errors: { op: string; code: string; message: string }[];
  tileErrors: TileError[];
}

export interface RunStatus {
  runId: RunId;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out';
  startedAt: string;
  finishedAt?: string;
  result?: SceneObservation;
  errorCode?: string;
  errorMessage?: string;
}
