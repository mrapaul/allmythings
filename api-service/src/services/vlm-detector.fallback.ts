import { DetectorUnavailableError } from '../clients/vlm-client';
import { logger } from '../utils/logger';
import {
  collectDetection,
  type DetectOptions,
  type Detector,
  type DetectionResult,
  type DetectorEvent,
} from './vlm-detector';

/**
 * Composes a primary and an optional secondary detector. If the primary is
 * unavailable before anything reached the client, the secondary runs instead.
 * Once events have streamed we never switch backends — mixing two models'
 * half-results would produce duplicate/conflicting items.
 */
export class FallbackDetector implements Detector {
  constructor(
    private readonly primary: Detector,
    private readonly secondary: Detector | null,
  ) {}

  async detect(imageBuffer: Buffer, opts?: DetectOptions): Promise<DetectionResult> {
    return collectDetection(this.detectStream(imageBuffer, opts));
  }

  async *detectStream(imageBuffer: Buffer, opts?: DetectOptions): AsyncGenerator<DetectorEvent> {
    let emitted = 0;
    try {
      for await (const ev of this.primary.detectStream(imageBuffer, opts)) {
        emitted += 1;
        yield ev;
      }
      return;
    } catch (err: unknown) {
      const canFallback =
        err instanceof DetectorUnavailableError && emitted === 0 && this.secondary !== null;
      if (!canFallback) throw err;
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'primary_detector_unavailable_falling_back',
      );
    }
    yield* this.secondary!.detectStream(imageBuffer, opts);
  }
}
