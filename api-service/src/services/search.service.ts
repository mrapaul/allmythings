/**
 * Search service - full-text search across inventory items and labels
 */

import { Database } from '../db/database';
import {
  SearchQuery,
  SearchResponse,
  SearchResult,
} from '../schemas/search.schema';
import { PaginationMeta } from '../schemas/inventory.schema';
import { DatabaseError } from '../utils/errors';
import { logger } from '../utils/logger';

interface SearchResultRow {
  item_id: string;
  photo_s3_key: string;
  thumbnail_s3_key: string;
  detection_data: any;
  created_at: Date;
  updated_at: Date;
  labels: any;
  search_rank: number;
}

/**
 * Search service
 */
export class SearchService {
  constructor(private db: Database) {}

  /**
   * Search inventory items
   */
  async search(
    userId: string,
    query: SearchQuery
  ): Promise<SearchResponse> {
    const startTime = Date.now();

    try {
      const { q, page, limit, minConfidence } = query;
      const offset = (page - 1) * limit;

      // Use the search_inventory function from the database
      const searchQuery = `
        SELECT * FROM search_inventory($1, $2, $3, $4, $5)
      `;
      const params = [userId, q, minConfidence || 0.7, limit, offset];

      const rows = await this.db.queryMany<SearchResultRow>(
        searchQuery,
        params
      );

      // Count total results
      const countQuery = `
        SELECT COUNT(DISTINCT i.id) as count
        FROM inventory_items i
        LEFT JOIN labels l ON i.id = l.item_id
        LEFT JOIN label_search_fts fts ON l.id = fts.label_id
        WHERE i.user_id = $1
          AND i.deleted_at IS NULL
          AND (
            fts.search_vector @@ plainto_tsquery('english', $2)
            OR l.value ILIKE '%' || $2 || '%'
          )
          AND (i.detection_data -> 'ensembleMetrics' ->> 'averageConfidence')::numeric >= $3
      `;
      const countParams = [userId, q, minConfidence || 0.7];

      const countResult = await this.db.queryOne<{ count: string }>(
        countQuery,
        countParams
      );
      const total = parseInt(countResult?.count || '0', 10);

      // Map results
      const baseUrl = process.env.S3_BASE_URL || 'https://storage.example.com';
      const results: SearchResult[] = rows.map((row, index) => ({
        id: row.item_id,
        userId,
        photoUrl: `${baseUrl}/${row.photo_s3_key}`,
        thumbnailUrl: `${baseUrl}/${row.thumbnail_s3_key}`,
        detectionData: row.detection_data,
        labels: Array.isArray(row.labels) ? row.labels : [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        rank: row.search_rank || (total - index),
        highlights: {
          labels: this.extractHighlights(row.labels, q),
        },
      }));

      // Pagination metadata
      const totalPages = Math.ceil(total / limit);
      const pagination: PaginationMeta = {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      };

      const processingTimeMs = Date.now() - startTime;

      logger.info(
        { userId, query: q, resultsCount: results.length, processingTimeMs },
        'Search completed'
      );

      return {
        results,
        pagination,
        query: q,
        processingTimeMs,
      };
    } catch (error) {
      logger.error({ error, userId, query }, 'Search failed');
      throw new DatabaseError('Search failed');
    }
  }

  /**
   * Extract highlights from labels
   */
  private extractHighlights(labels: any[], query: string): string[] {
    if (!Array.isArray(labels)) {
      return [];
    }

    const queryLower = query.toLowerCase();
    const highlights: string[] = [];

    for (const label of labels) {
      if (label.value && label.value.toLowerCase().includes(queryLower)) {
        highlights.push(label.value);
      }
    }

    return highlights;
  }
}
