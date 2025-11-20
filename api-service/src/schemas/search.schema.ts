import { z } from 'zod';
import { InventoryItemSchema, PaginationSchema, PaginationMetaSchema } from './inventory.schema';

/**
 * Validation schemas for search functionality
 */

// Search query params
export const SearchQuerySchema = PaginationSchema.extend({
  q: z.string().min(1).max(200),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

// Search result item (extends inventory item with search metadata)
export const SearchResultSchema = InventoryItemSchema.extend({
  rank: z.number(),
  highlights: z.object({
    labels: z.array(z.string()),
  }),
});

// Search response
export const SearchResponseSchema = z.object({
  results: z.array(SearchResultSchema),
  pagination: PaginationMetaSchema,
  query: z.string(),
  processingTimeMs: z.number().int(),
});

// Type exports
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
