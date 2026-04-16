import { BoundingBoxResult, ObjectDetector } from './detector.interface';
import { injectTraceHeaders } from '../telemetry/trace-context';
import { logger } from '../utils/logger';

interface FlorenceRegion {
  caption: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FlorenceResponse {
  regions: FlorenceRegion[];
  image_width: number;
  image_height: number;
}

export class FlorenceDetector implements ObjectDetector {
  readonly name = 'florence-2';

  constructor(private readonly baseUrl: string) {}

  async detect(image: Buffer): Promise<BoundingBoxResult[]> {
    const headers: Record<string, string> = {};
    injectTraceHeaders(headers);

    const formData = new FormData();
    formData.append('file', new Blob([image], { type: 'image/jpeg' }), 'image.jpg');

    const response = await fetch(`${this.baseUrl}/detect/florence`, {
      method: 'POST',
      headers,
      body: formData,
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`Florence detector returned ${response.status}`);
    }

    const data: FlorenceResponse = await response.json();
    logger.info({ count: data.regions.length }, 'Florence-2: regions detected');

    return data.regions.map((r) => ({
      box: { x: r.x, y: r.y, width: r.width, height: r.height },
      coarseLabel: r.caption,
      confidence: 1.0,
    }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
