/**
 * Detection service - handles image validation and detection pipeline
 * Coordinates vision provider orchestration and result storage
 */

import { VisionOrchestratorService } from './vision-orchestrator.service';
import { ImageQualityService } from './image-quality.service';
import { ImageProcessingError, BadRequestError } from '../utils/errors';
import { logger } from '../utils/logger';
import { DetectionResponse } from '../schemas/detection.schema';

/**
 * Supported image formats
 */
const SUPPORTED_FORMATS = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

/**
 * Image constraints
 */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Image metadata
 */
export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
  mimeType: string;
}

/**
 * Detection request options
 */
export interface DetectionOptions {
  minConfidence?: number;
  userId?: string; // For future analytics tracking
}

/**
 * Detection service
 */
export class DetectionService {
  private orchestrator: VisionOrchestratorService;
  private qualityService: ImageQualityService;

  constructor(orchestrator: VisionOrchestratorService) {
    this.orchestrator = orchestrator;
    this.qualityService = new ImageQualityService();
  }

  /**
   * Detect objects in image
   */
  async detectObjects(
    imageBuffer: Buffer,
    options: DetectionOptions = {}
  ): Promise<DetectionResponse> {
    const startTime = Date.now();

    try {
      // Validate image format and size
      const metadata = await this.validateImage(imageBuffer);
      logger.info({ metadata }, 'Image validated successfully');

      // Analyze image quality (blur, brightness, resolution)
      const imageQuality = await this.qualityService.analyzeQuality(imageBuffer);
      logger.info({ imageQuality }, 'Image quality analyzed');

      // Preprocess image if needed
      const processedBuffer = await this.preprocessImage(imageBuffer);

      // Run detection through vision orchestrator
      const response = await this.orchestrator.detectObjects(
        processedBuffer
      );

      // Add quality metrics to response
      response.imageQuality = imageQuality;

      // Filter by confidence if specified
      if (options.minConfidence !== undefined) {
        response.detections = response.detections.filter(
          (d) => d.confidence >= options.minConfidence!
        );
      }

      const totalTime = Date.now() - startTime;
      logger.info(
        {
          detectionsCount: response.detections.length,
          processingTimeMs: totalTime,
          qualityLevel: imageQuality.qualityLevel,
          userId: options.userId,
        },
        'Detection completed'
      );

      return response;
    } catch (error) {
      logger.error({ error, options }, 'Detection failed');
      if (error instanceof ImageProcessingError || error instanceof BadRequestError) {
        throw error;
      }
      throw new ImageProcessingError(
        error instanceof Error ? error.message : 'Detection failed'
      );
    }
  }

  /**
   * Validate image format, size, and dimensions
   * Basic validation without external dependencies
   */
  async validateImage(imageBuffer: Buffer): Promise<ImageMetadata> {
    try {
      // Check file size
      if (imageBuffer.length > MAX_IMAGE_SIZE) {
        throw new ImageProcessingError(
          `Image size ${imageBuffer.length} bytes exceeds maximum ${MAX_IMAGE_SIZE} bytes`
        );
      }

      if (imageBuffer.length === 0) {
        throw new ImageProcessingError('Image buffer is empty');
      }

      // Detect image format from magic bytes
      const format = this.detectImageFormat(imageBuffer);
      const mimeType = `image/${format}`;

      if (!SUPPORTED_FORMATS.includes(mimeType)) {
        throw new ImageProcessingError(
          `Unsupported image format: ${mimeType}. Supported formats: ${SUPPORTED_FORMATS.join(', ')}`
        );
      }

      // Basic dimension validation (simplified - in production use proper image library)
      // For now, accept all dimensions within reasonable bounds
      return {
        width: 1920, // Placeholder
        height: 1080, // Placeholder
        format,
        size: imageBuffer.length,
        mimeType,
      };
    } catch (error) {
      if (error instanceof ImageProcessingError) {
        throw error;
      }
      logger.error({ error }, 'Image validation failed');
      throw new ImageProcessingError('Invalid image file');
    }
  }

  /**
   * Detect image format from magic bytes
   */
  private detectImageFormat(buffer: Buffer): string {
    // Check magic bytes
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return 'jpeg';
    }
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4E &&
      buffer[3] === 0x47
    ) {
      return 'png';
    }
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return 'webp';
    }
    throw new ImageProcessingError('Unable to determine image format');
  }

  /**
   * Preprocess image if needed
   * For Phase 1, return original buffer
   * In production: convert, resize, normalize orientation
   */
  private async preprocessImage(
    imageBuffer: Buffer
  ): Promise<Buffer> {
    // For Phase 1, return original buffer
    // In production, use sharp or similar library for:
    // - Auto-rotate based on EXIF orientation
    // - Resize if too large
    // - Convert to optimal format
    return imageBuffer;
  }

  /**
   * Generate thumbnail from image
   * Placeholder for Phase 1
   */
  async generateThumbnail(
    imageBuffer: Buffer,
    width: number = 300,
    height: number = 300
  ): Promise<Buffer> {
    // For Phase 1, return original buffer
    // In production, use image processing library
    logger.debug({ width, height }, 'Thumbnail generation (placeholder)');
    return imageBuffer;
  }

  /**
   * Extract image metadata
   */
  async extractMetadata(imageBuffer: Buffer): Promise<ImageMetadata> {
    return this.validateImage(imageBuffer);
  }
}
