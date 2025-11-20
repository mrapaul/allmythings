import { z } from 'zod';
import { DetectionResponseSchema } from './detection.schema';

/**
 * Validation schemas for inventory items
 */

// Label schema
export const LabelSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  key: z.string().min(1).max(50).nullable(),
  value: z.string().min(1).max(100),
  createdAt: z.coerce.date(),
});

// Create label request
export const CreateLabelSchema = z.object({
  itemId: z.string().uuid(),
  key: z.string().min(1).max(50).nullable().optional(),
  value: z.string().min(1).max(100),
});

// Update label request
export const UpdateLabelSchema = z.object({
  value: z.string().min(1).max(100),
});

// Inventory item schema
export const InventoryItemSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  photoUrl: z.string().url(),
  thumbnailUrl: z.string().url(),
  detectionData: DetectionResponseSchema,
  labels: z.array(LabelSchema),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deletedAt: z.coerce.date().nullable().optional(),
});

// Create item request
export const CreateItemRequestSchema = z.object({
  photoS3Key: z.string().min(1),
  thumbnailS3Key: z.string().min(1),
  detectionData: DetectionResponseSchema,
  initialLabels: z
    .array(
      z.object({
        key: z.string().min(1).max(50).nullable().optional(),
        value: z.string().min(1).max(100),
      })
    )
    .optional(),
});

// Update item request
export const UpdateItemRequestSchema = z.object({
  photoUrl: z.string().url().optional(),
  thumbnailUrl: z.string().url().optional(),
});

// Pagination schema
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Sort schema
export const SortSchema = z
  .enum(['createdAt_desc', 'createdAt_asc', 'updatedAt_desc', 'confidence_desc'])
  .default('createdAt_desc');

// List items query params
export const ListItemsQuerySchema = PaginationSchema.extend({
  sort: SortSchema,
  minConfidence: z.coerce.number().min(0).max(1).optional(),
});

// Pagination metadata
export const PaginationMetaSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});

// Paginated response
export const PaginatedItemsResponseSchema = z.object({
  items: z.array(InventoryItemSchema),
  pagination: PaginationMetaSchema,
});

// Type exports
export type Label = z.infer<typeof LabelSchema>;
export type CreateLabelDto = z.infer<typeof CreateLabelSchema>;
export type UpdateLabelDto = z.infer<typeof UpdateLabelSchema>;
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type CreateItemRequest = z.infer<typeof CreateItemRequestSchema>;
export type UpdateItemRequest = z.infer<typeof UpdateItemRequestSchema>;
export type PaginationDto = z.infer<typeof PaginationSchema>;
export type SortOption = z.infer<typeof SortSchema>;
export type ListItemsQuery = z.infer<typeof ListItemsQuerySchema>;
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;
export type PaginatedItemsResponse = z.infer<typeof PaginatedItemsResponseSchema>;
