import { z } from 'zod';
import { InventoryItemSchema, LabelSchema, PaginationSchema, PaginationMetaSchema } from './inventory.schema';

/**
 * Validation schemas for offline sync
 */

// Sync request params
export const SyncQuerySchema = PaginationSchema.extend({
  since: z.coerce.date(),
});

// Sync response
export const SyncResponseSchema = z.object({
  items: z.array(InventoryItemSchema),
  labels: z.array(LabelSchema),
  deletedItemIds: z.array(z.string().uuid()),
  timestamp: z.coerce.date(),
  pagination: PaginationMetaSchema,
});

// Conflict schema
export const ConflictSchema = z.object({
  itemId: z.string().uuid(),
  field: z.string(),
  clientValue: z.any(),
  serverValue: z.any(),
  resolution: z.enum(['client_wins', 'server_wins']),
});

// Push changes request
export const PushChangesRequestSchema = z.object({
  items: z.array(InventoryItemSchema),
  labels: z.array(LabelSchema),
  deletedItemIds: z.array(z.string().uuid()),
});

// Push changes response
export const PushChangesResponseSchema = z.object({
  syncedItemIds: z.array(z.string().uuid()),
  conflicts: z.array(ConflictSchema),
  timestamp: z.coerce.date(),
});

// Conflict response
export const ConflictResponseSchema = z.object({
  conflicts: z.array(ConflictSchema),
});

// Type exports
export type SyncQuery = z.infer<typeof SyncQuerySchema>;
export type SyncResponse = z.infer<typeof SyncResponseSchema>;
export type Conflict = z.infer<typeof ConflictSchema>;
export type PushChangesRequest = z.infer<typeof PushChangesRequestSchema>;
export type PushChangesResponse = z.infer<typeof PushChangesResponseSchema>;
export type ConflictResponse = z.infer<typeof ConflictResponseSchema>;
