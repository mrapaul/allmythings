import type { DetectedItem } from '../types/detected-item';
import type { CoordMode } from './vlm-detector.parse';

export interface GroundingDinoOptions {
  endpoint: string;
  prompt: string;
  boxThreshold: number;
  textThreshold: number;
  maxImageSize: number;
  coordMode: CoordMode | 'auto';
  confidenceThreshold: number;
}

interface GroundingDinoResponse {
  boxes: number[][];
  labels: string[];
  scores: number[];
}

export class GroundingDinoAdapter {
  constructor(private readonly opts: GroundingDinoOptions) {}

  async detect(imageBuffer: Buffer): Promise<DetectedItem[]> {
    const items: DetectedItem[] = [];
    for await (const item of this.detectStream(imageBuffer)) {
      items.push(item);
    }
    return items;
  }

  async *detectStream(imageBuffer: Buffer): AsyncGenerator<DetectedItem> {
    const img = await this.prepareImage(imageBuffer);

    try {
      const response = await this.callGroundingDino(img.base64);

      for (const detection of response) {
        if ((detection.confidence ?? 0) >= this.opts.confidenceThreshold) {
          yield detection;
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`grounding_dino_failed: ${msg}`);
    }
  }

  private async callGroundingDino(base64Image: string): Promise<GroundingDinoResponse[]> {
    const payload = {
      images: [base64Image],
      prompts: [this.opts.prompt],
      box_threshold: this.opts.boxThreshold,
      text_threshold: this.opts.textThreshold,
    };

    try {
      const response = await fetch(this.opts.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`GroundingDINO API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return Array.isArray(data) ? data : [data];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`GroundingDINO inference failed: ${msg}`);
    }
  }

  private async prepareImage(buffer: Buffer) {
    const data = await import('sharp');
    const pipeline = data.default(buffer)
      .rotate()
      .resize(this.opts.maxImageSize, this.opts.maxImageSize, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    const { data: imageData, info } = await pipeline
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    
    return {
      base64: imageData.toString('base64'),
      width: info.width,
      height: info.height,
    };
  }
}
