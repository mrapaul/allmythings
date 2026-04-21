/**
 * Types shared between workflow code and activity code.
 *
 * IMPORTANT: Workflow code must be deterministic and cannot import Node built-ins
 * that are non-deterministic (fs, crypto, etc.). Only pure types + value objects go here.
 */

export interface DetectInput {
  imageBase64: string;   // base64 so it round-trips through Temporal payload encoding cleanly
  imageSha256: string;   // precomputed by the HTTP layer; used as workflowId idempotency key
  mimeType: string;      // 'image/jpeg' | 'image/png' | 'image/webp'
  traceId: string;
  requestId: string;
}

export interface SavedPhoto {
  photoId: string;
  photoPath: string;
  thumbnailPath: string;
  bytes: number;
}

export interface FlorenceRegion {
  caption: string;
  x: number;
  y: number;
  width: number;
  height: number;
  regionIndex: number;
}

export interface FlorenceDetection {
  regions: FlorenceRegion[];
  imageWidth: number;
  imageHeight: number;
}

export type EnrichmentTier = 'qwen7b' | 'qwen3b' | 'moondream' | 'florence-only';

export interface EnrichedItem {
  id: string;
  regionIndex: number;
  label: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  enrichmentTier: EnrichmentTier;
  attributes: {
    name: string;
    category: string;
    color: string | null;
    material: string | null;
    condition: string | null;
    estimatedValue: string | null;
    description: string;
    searchTags: string[];
  };
}

export interface PipelineError {
  step: string;
  code: string;
  message: string;
  retryable: boolean;
}

export interface DetectResult {
  photoId: string;
  photoUrl: string;
  itemCount: number;
  items: EnrichedItem[];
  errors: PipelineError[];
  traceId: string;
  processingMs: number;
}
