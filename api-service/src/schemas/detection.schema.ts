import { z } from 'zod';

export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const ClassifiedObjectSchema = z.object({
  boxIndex: z.number(),
  label: z.string(),
  category: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  colors: z.array(z.string()),
  materials: z.array(z.string()),
  condition: z.string().nullable(),
  estimatedValue: z.object({ low: z.number(), high: z.number() }).nullable(),
  description: z.string().nullable(),
  confidence: z.number(),
  boundingBox: BoundingBoxSchema,
});

export const DetectionResponseSchema = z.object({
  detections: z.array(ClassifiedObjectSchema),
  processingTimeMs: z.number(),
  detector: z.string().optional(),
  classifier: z.string().optional(),
  imageQuality: z.object({
    blur: z.number(),
    brightness: z.number(),
    contrast: z.number(),
  }).optional(),
});

export type DetectionResponse = z.infer<typeof DetectionResponseSchema>;
