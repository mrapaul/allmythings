import { z } from 'zod';

export const BoundingBoxSchema = z.object({
  ymin: z.number().min(0).max(1000),
  xmin: z.number().min(0).max(1000),
  ymax: z.number().min(0).max(1000),
  xmax: z.number().min(0).max(1000),
});

// 100% Open-ended key-value properties discovered dynamically by the fine-tuned Vision SLM
export const OpenPropertiesSchema = z.record(z.string(), z.string());

// Emergent cluster & Ionicons glyph dynamically assigned by the Taxonomy SLM
export const DynamicFacetSchema = z.object({
  facetId: z.string().min(1),
  glyphName: z.string().min(1),
  accentHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#FAFAFA'),
});

export const DetectedObjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  confidence: z.number().min(0).max(1),
  box2d: BoundingBoxSchema,
  properties: OpenPropertiesSchema,
  labels: z.array(z.string().min(1)),
  facet: DynamicFacetSchema,
});

export const TrainingFeedbackPairSchema = z.object({
  runId: z.string().uuid(),
  objectId: z.string().uuid(),
  cropBase64: z.string().min(1),
  modelPrediction: z.object({
    name: z.string(),
    properties: OpenPropertiesSchema,
    labels: z.array(z.string()),
    facet: DynamicFacetSchema,
  }),
  userVerified: z.object({
    name: z.string().min(1),
    properties: OpenPropertiesSchema,
    labels: z.array(z.string().min(1)),
    facet: DynamicFacetSchema,
  }),
  wasRejectedFalsePositive: z.boolean().default(false),
});

export type BoundingBox = z.infer<typeof BoundingBoxSchema>;
export type OpenProperties = z.infer<typeof OpenPropertiesSchema>;
export type DynamicFacet = z.infer<typeof DynamicFacetSchema>;
export type DetectedObject = z.infer<typeof DetectedObjectSchema>;
export type TrainingFeedbackPair = z.infer<typeof TrainingFeedbackPairSchema>;
