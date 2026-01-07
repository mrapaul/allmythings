import { z } from 'zod';

/**
 * Zod validation schemas matching vision-api.yaml contract
 */

export const BoundingBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});

export const AlternativeLabelSchema = z.object({
  label: z.string(),
  confidence: z.number().min(0).max(1),
  provider: z.enum(['meta', 'google', 'aws', 'tensorflow', 'mock', 'gemini', 'ollama']),
});

export const EnsembleDetailsSchema = z.object({
  providerAgreement: z.number().int().min(1).max(4),
  confidenceByProvider: z.record(z.number().min(0).max(1)),
  labelConsensus: z.string(),
});

export const DetectionSchema = z.object({
  id: z.string(),
  label: z.string(),
  category: z.string().optional(),
  confidence: z.number().min(0).max(1),
  boundingBox: BoundingBoxSchema,
  ensembleDetails: EnsembleDetailsSchema,
  alternativeLabels: z.array(AlternativeLabelSchema),
});

export const ProviderResultSchema = z.object({
  provider: z.enum(['meta', 'google', 'aws', 'tensorflow', 'mock', 'gemini', 'ollama']),
  success: z.boolean(),
  processingTimeMs: z.number().int().min(0),
  detections: z.array(DetectionSchema),
  error: z.string().optional(),
});

export const EnsembleMetricsSchema = z.object({
  providersUsed: z.number().int().min(0).max(4),
  averageConfidence: z.number().min(0).max(1),
  consensusRate: z.number().min(0).max(1),
});

export const QualityMetricsSchema = z.object({
  isBlurry: z.boolean(),
  blurScore: z.number().min(0).max(1),
  brightness: z.number().min(0).max(1),
  contrast: z.number().min(0).max(1),
  resolution: z.object({
    width: z.number().int().min(0),
    height: z.number().int().min(0),
    megapixels: z.number().min(0),
  }),
  qualityLevel: z.enum(['excellent', 'good', 'acceptable', 'poor']),
  feedback: z.array(z.string()),
  recommendedAction: z.enum(['process', 'retry_lighting', 'retry_focus', 'retry_both', 'reject']),
});

export const DetectionResponseSchema = z.object({
  success: z.boolean(),
  ensembleMode: z.enum(['full', 'partial', 'single', 'none']),
  processingTimeMs: z.number().int().min(0),
  detections: z.array(DetectionSchema),
  providerResults: z.array(ProviderResultSchema),
  ensembleMetrics: EnsembleMetricsSchema,
  imageQuality: QualityMetricsSchema.optional(),
  error: z.string().optional(),
});

export const DetectionRequestSchema = z.object({
  minConfidence: z.number().min(0).max(1).default(0.7),
});

// Type exports
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;
export type Detection = z.infer<typeof DetectionSchema>;
export type ProviderResult = z.infer<typeof ProviderResultSchema>;
export type EnsembleMetrics = z.infer<typeof EnsembleMetricsSchema>;
export type QualityMetrics = z.infer<typeof QualityMetricsSchema>;
export type DetectionResponse = z.infer<typeof DetectionResponseSchema>;
export type DetectionRequest = z.infer<typeof DetectionRequestSchema>;
