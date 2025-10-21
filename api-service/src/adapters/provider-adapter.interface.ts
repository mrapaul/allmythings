import { Detection } from '../schemas/detection.schema';

/**
 * Interface for vision provider adapters
 */

export interface ProviderAdapter {
  /**
   * Detect objects in an image
   * @param imageBuffer Binary image data
   * @returns Array of detections
   */
  detectObjects(imageBuffer: Buffer): Promise<Detection[]>;

  /**
   * Check if provider is healthy
   */
  health(): Promise<boolean>;

  /**
   * Get provider name
   */
  getName(): string;
}
