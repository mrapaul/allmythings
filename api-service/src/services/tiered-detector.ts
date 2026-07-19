import type { DetectedItem } from '../types/detected-item';
import type { Detector } from '../services/vlm-detector.factory';

export interface TieredDetectorOptions {
  t1Detector: Detector;
  t2Adapter: Detector;
}

export class TieredDetector implements Detector {
  private readonly t1: Detector;
  private readonly t2: Detector;

  constructor({ t1Detector, t2Adapter }: TieredDetectorOptions) {
    this.t1 = t1Detector;
    this.t2 = t2Adapter;
  }

  async detect(imageBuffer: Buffer): Promise<DetectedItem[]> {
    const items: DetectedItem[] = [];
    for await (const item of this.detectStream(imageBuffer)) {
      items.push(item);
    }
    return items;
  }

  async *detectStream(imageBuffer: Buffer): AsyncGenerator<DetectedItem> {
    const t1Detections = await this.t1.detect(imageBuffer);

    if (t1Detections.length === 0) {
      return;
    }

    for (const t1Item of t1Detections) {
      const refined = await this.refineWithTier2(imageBuffer, t1Item);
      if (refined) {
        yield refined;
      }
    }
  }

  private async refineWithTier2(
    imageBuffer: Buffer,
    t1Item: DetectedItem,
  ): Promise<DetectedItem | null> {
    try {
      const cropped = await this.cropImage(imageBuffer, t1Item.box);

      const t2Detections = await this.t2.detect(cropped);

      if (t2Detections.length === 0) {
        return t1Item;
      }

      const best = t2Detections[0];

      return {
        label: best.label,
        description: t1Item.description ? `${t1Item.description}, ${best.description}` : best.description,
        category: best.category,
        tags: [...new Set([...(t1Item.tags ?? []), ...(best.tags ?? [])])],
        box: t1Item.box,
        confidence: (t1Item.confidence ?? 0.5) * (best.confidence ?? 0.5),
      };
    } catch {
      return t1Item;
    }
  }

  private async cropImage(
    buffer: Buffer,
    box: { x: number; y: number; width: number; height: number },
  ): Promise<Buffer> {
    const sharp = (await import('sharp')).default;
    const { data } = await sharp(buffer)
      .extract({
        left: Math.floor(box.x),
        top: Math.floor(box.y),
        width: Math.ceil(box.width),
        height: Math.ceil(box.height),
      })
      .jpeg({ quality: 95 })
      .toBuffer({ resolveWithObject: true });

    return data;
  }
}
