/**
 * Cached Detection Service
 * Wraps the detection service with Redis caching for improved performance
 */

import { createHash } from 'crypto';
import { RedisCache } from '../cache/redis-cache';
import { VisionOrchestratorService } from './vision-orchestrator.service';
import { DetectionResponse } from '../schemas/detection.schema';
import { logger } from '../utils/logger';

/**
 * Detection options
 */
export interface DetectionOptions {
  minConfidence?: number;
  userId?: string;
  bypassCache?: boolean;
}

/**
 * Cache configuration for detections
 */
interface DetectionCacheConfig {
  ttl: number; // Cache TTL in seconds
  enabled: boolean;
}

/**
 * Cached detection service with cache-aside pattern
 */
export class CachedDetectionService {
  private orchestrator: VisionOrchestratorService;
  private cache: RedisCache;
  private cacheConfig: DetectionCacheConfig;

  constructor(
    orchestrator: VisionOrchestratorService,
    cache: RedisCache,
    config?: Partial<DetectionCacheConfig>
  ) {
    this.orchestrator = orchestrator;
    this.cache = cache;
    this.cacheConfig = {
      ttl: config?.ttl || 86400, // 24 hours default
      enabled: config?.enabled ?? true,
    };
  }

  /**
   * Detect objects with caching
   */
  async detectObjects(
    imageBuffer: Buffer,
    options: DetectionOptions = {}
  ): Promise<DetectionResponse & { fromCache?: boolean }> {
    // Skip cache if disabled or explicitly bypassed
    if (!this.cacheConfig.enabled || options.bypassCache) {
      return await this.runDetection(imageBuffer, options);
    }

    // Generate cache key from image hash and options
    const cacheKey = this.generateCacheKey(imageBuffer, options);

    // Try to get from cache
    const cached = await this.cache.get<DetectionResponse>(cacheKey);

    if (cached) {
      logger.info(
        { cacheKey, userId: options.userId },
        'Detection cache hit'
      );
      return { ...cached, fromCache: true };
    }

    // Cache miss - run detection
    logger.info(
      { cacheKey, userId: options.userId },
      'Detection cache miss'
    );

    const result = await this.runDetection(imageBuffer, options);

    // Cache the result (fire and forget - don't wait)
    this.cache
      .set(cacheKey, result, this.cacheConfig.ttl)
      .catch((error) => {
        logger.error({ error, cacheKey }, 'Failed to cache detection result');
      });

    return { ...result, fromCache: false };
  }

  /**
   * Run actual detection (cache miss)
   */
  private async runDetection(
    imageBuffer: Buffer,
    options: DetectionOptions
  ): Promise<DetectionResponse> {
    const startTime = Date.now();

    try {
      const response = await this.orchestrator.detectObjects(imageBuffer);

      // Filter by minimum confidence if specified
      if (options.minConfidence) {
        response.detections = response.detections.filter(
          (d) => d.confidence >= options.minConfidence!
        );
      }

      const duration = Date.now() - startTime;
      logger.info(
        {
          userId: options.userId,
          detectionCount: response.detections.length,
          duration,
        },
        'Detection completed'
      );

      return response;
    } catch (error) {
      logger.error({ error, userId: options.userId }, 'Detection failed');
      throw error;
    }
  }

  /**
   * Generate cache key from image and options
   */
  private generateCacheKey(
    imageBuffer: Buffer,
    options: DetectionOptions
  ): string {
    // Hash the image buffer for cache key
    const imageHash = createHash('sha256')
      .update(imageBuffer)
      .digest('hex')
      .substring(0, 16); // Use first 16 chars for shorter keys

    // Include options in cache key
    const optionsHash = createHash('md5')
      .update(JSON.stringify({
        minConfidence: options.minConfidence || 0,
      }))
      .digest('hex')
      .substring(0, 8);

    return `detection:${imageHash}:${optionsHash}`;
  }

  /**
   * Invalidate detection cache for a specific image
   */
  async invalidateDetection(imageBuffer: Buffer): Promise<void> {
    const imageHash = createHash('sha256')
      .update(imageBuffer)
      .digest('hex')
      .substring(0, 16);

    // Invalidate all cache entries for this image (different confidence thresholds)
    await this.cache.invalidatePattern(`detection:${imageHash}:*`);

    logger.info({ imageHash }, 'Detection cache invalidated');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getMetrics();
  }

  /**
   * Warm cache with popular images (optional optimization)
   */
  async warmCache(images: Buffer[]): Promise<void> {
    logger.info({ count: images.length }, 'Starting cache warming');

    const promises = images.map((imageBuffer) =>
      this.detectObjects(imageBuffer, { bypassCache: false })
    );

    await Promise.allSettled(promises);

    logger.info('Cache warming completed');
  }
}
