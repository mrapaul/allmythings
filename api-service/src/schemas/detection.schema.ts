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
  provider: z.enum(['meta', 'google', 'aws', 'tensorflow']),
});

export const EnsembleDetailsSchema = z.object({
  providerAgreement: z.number().int().min(1).max(4),
  confidenceByProvider: z.record(z.number().min(0).max(1)),
  labelConsensus: z.string(),
});

export const DetectionSchema = z.object({
  id: z.string(),
  label: z.string(),
  confidence: z.number().min(0).max(1),
  boundingBox: BoundingBoxSchema,
  ensembleDetails: EnsembleDetailsSchema,
  alternativeLabels: z.array(AlternativeLabelSchema),
});

export const ProviderResultSchema = z.object({
  provider: z.enum(['meta', 'google', 'aws', 'tensorflow']),
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

export const DetectionResponseSchema = z.object({
  success: z.boolean(),
  ensembleMode: z.enum(['full', 'partial', 'single', 'none']),
  processingTimeMs: z.number().int().min(0),
  detections: z.array(DetectionSchema),
  providerResults: z.array(ProviderResultSchema),
  ensembleMetrics: EnsembleMetricsSchema,
  error: z.string().optional(),
});

export const DetectionRequestSchema = z.object({
  minConfidence: z.number().min(0).max(1).default(0.7),
});

// Type exports
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;
export type Detection = z.infer<typeof DetectionSchema>;
export type ProviderResult = z.infer<typeof ProviderResultSchema>;
export type DetectionResponse = z.infer<typeof DetectionResponseSchema>;
export type DetectionRequest = z.infer<typeof DetectionRequestSchema>;
