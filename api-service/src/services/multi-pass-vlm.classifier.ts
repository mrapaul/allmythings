import sharp from 'sharp';
import { ObjectClassifier, ClassifiedObject } from '../providers/classifier.interface';
import { EnvConfig } from '../config/env.config';
import { logger } from '../utils/logger';

export type Quadrant = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/\s+/));
  const tokensB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...tokensA].filter((t) => tokensB.has(t)));
  const union = new Set([...tokensA, ...tokensB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

export function cropQuadrant(
  quadrant: Quadrant,
  imageWidth: number,
  imageHeight: number,
  overlapFraction: number,
): { x: number; y: number; width: number; height: number } {
  const cropW = Math.round(imageWidth * overlapFraction);
  const cropH = Math.round(imageHeight * overlapFraction);

  switch (quadrant) {
    case 'top-left':
      return { x: 0, y: 0, width: cropW, height: cropH };
    case 'top-right':
      return { x: imageWidth - cropW, y: 0, width: cropW, height: cropH };
    case 'bottom-left':
      return { x: 0, y: imageHeight - cropH, width: cropW, height: cropH };
    case 'bottom-right':
      return { x: imageWidth - cropW, y: imageHeight - cropH, width: cropW, height: cropH };
  }
}

/**
 * Normalize pixel-space bounding boxes to [0,1]. VLMs return bbox coordinates in
 * the model's internal pixel grid (varies by model and input image size). The
 * mobile client expects normalized coordinates so it can multiply by its own
 * display size. Values already in [0,1] pass through unchanged.
 */
function normalizeBoundingBox(
  obj: ClassifiedObject,
  imageWidth: number,
  imageHeight: number,
): ClassifiedObject {
  const bb = obj.boundingBox;
  // Already normalized: all values ≤ 1.0
  if (bb.x <= 1 && bb.y <= 1 && bb.width <= 1 && bb.height <= 1) return obj;
  if (imageWidth <= 0 || imageHeight <= 0) return obj;
  return {
    ...obj,
    boundingBox: {
      x: Math.max(0, Math.min(1, bb.x / imageWidth)),
      y: Math.max(0, Math.min(1, bb.y / imageHeight)),
      width: Math.max(0, Math.min(1, bb.width / imageWidth)),
      height: Math.max(0, Math.min(1, bb.height / imageHeight)),
    },
  };
}

function boxCenterDistance(a: ClassifiedObject, b: ClassifiedObject): number {
  const acx = a.boundingBox.x + a.boundingBox.width / 2;
  const acy = a.boundingBox.y + a.boundingBox.height / 2;
  const bcx = b.boundingBox.x + b.boundingBox.width / 2;
  const bcy = b.boundingBox.y + b.boundingBox.height / 2;
  return Math.sqrt((acx - bcx) ** 2 + (acy - bcy) ** 2);
}

export function deduplicateObjects(objects: ClassifiedObject[]): ClassifiedObject[] {
  if (objects.length === 0) return [];

  const sorted = [...objects].sort((a, b) => b.confidence - a.confidence);
  const kept: ClassifiedObject[] = [];

  for (const obj of sorted) {
    const isDuplicate = kept.some(
      (existing) =>
        boxCenterDistance(obj, existing) < 0.15 &&
        jaccardSimilarity(obj.label, existing.label) >= 0.3,
    );
    if (!isDuplicate) {
      kept.push(obj);
    }
  }

  return kept;
}

function remapQuadrantBoxToFull(
  obj: ClassifiedObject,
  crop: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number,
): ClassifiedObject {
  const bb = obj.boundingBox;
  return {
    ...obj,
    boundingBox: {
      x: (crop.x + bb.x * crop.width) / imageWidth,
      y: (crop.y + bb.y * crop.height) / imageHeight,
      width: (bb.width * crop.width) / imageWidth,
      height: (bb.height * crop.height) / imageHeight,
    },
  };
}

export class MultiPassVlmClassifier {
  private classifiers: ObjectClassifier[];
  private config: EnvConfig;

  constructor(classifiers: ObjectClassifier[], config: EnvConfig) {
    this.classifiers = classifiers;
    this.config = config;
  }

  async detect(image: Buffer): Promise<ClassifiedObject[]> {
    const multiPassEnabled = process.env.MULTI_PASS_ENABLED === 'true';

    // Always measure image dimensions — needed to normalize VLM-returned pixel bboxes
    const metadata = await sharp(image).metadata();
    const imageWidth = metadata.width!;
    const imageHeight = metadata.height!;

    let crops: Array<{ quadrant: Quadrant; x: number; y: number; width: number; height: number }> = [];
    let cropBuffers: Buffer[] = [];

    if (multiPassEnabled) {
      const overlap = this.config.multiPassQuadrantOverlap;

      const quadrants: Quadrant[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
      crops = quadrants.map((q) => ({
        quadrant: q,
        ...cropQuadrant(q, imageWidth, imageHeight, overlap),
      }));

      cropBuffers = await Promise.all(
        crops.map((c) =>
          sharp(image).extract({ left: c.x, top: c.y, width: c.width, height: c.height }).toBuffer(),
        ),
      );
    }

    // Try primary classifier (Ollama; fallback to Gemini)
    const primary = this.findClassifier('ollama') ?? this.findClassifier('gemini');
    const normalize = (objs: ClassifiedObject[]): ClassifiedObject[] =>
      objs.map((o) => normalizeBoundingBox(o, imageWidth, imageHeight));

    if (primary) {
      try {
        const results = multiPassEnabled
          ? await this.runMultiPass(primary, image, cropBuffers, crops, imageWidth, imageHeight)
          : await this.callClassifier(primary, image);
        if (results.length >= this.config.multiPassRetryThreshold) {
          return normalize(results);
        }

        logger.info({ count: results.length, threshold: this.config.multiPassRetryThreshold }, 'Below retry threshold, trying secondary');
        const secondary = this.classifiers.find((c) => c !== primary);
        if (secondary) {
          const overviewRetry = await this.callClassifier(secondary, image);
          const combined = deduplicateObjects([...results, ...overviewRetry]);
          return normalize(combined);
        }

        return normalize(results);
      } catch (error) {
        logger.warn({ error: (error as Error).message }, 'Primary VLM failed, trying fallback');
      }
    }

    // Fallback: try remaining classifiers
    for (const classifier of this.classifiers) {
      if (classifier === primary) continue;
      try {
        const results = multiPassEnabled
          ? await this.runMultiPass(classifier, image, cropBuffers, crops, imageWidth, imageHeight)
          : await this.callClassifier(classifier, image);
        return normalize(results);
      } catch (error) {
        logger.warn({ provider: classifier.name, error: (error as Error).message }, 'Fallback VLM failed');
      }
    }

    return [];
  }

  private async runMultiPass(
    classifier: ObjectClassifier,
    fullImage: Buffer,
    cropBuffers: Buffer[],
    crops: Array<{ quadrant: Quadrant; x: number; y: number; width: number; height: number }>,
    imageWidth: number,
    imageHeight: number,
  ): Promise<ClassifiedObject[]> {
    const [overviewResults, ...quadrantResults] = await Promise.all([
      this.callClassifier(classifier, fullImage),
      ...cropBuffers.map((buf) => this.callClassifier(classifier, buf)),
    ]);

    const remappedQuadrants = quadrantResults.flatMap((results, i) =>
      results.map((obj) => remapQuadrantBoxToFull(obj, crops[i], imageWidth, imageHeight)),
    );

    const allObjects = [...overviewResults, ...remappedQuadrants];
    return deduplicateObjects(allObjects);
  }

  private async callClassifier(classifier: ObjectClassifier, image: Buffer): Promise<ClassifiedObject[]> {
    try {
      return await classifier.classify(image, []);
    } catch (error) {
      logger.warn({ provider: classifier.name, error: (error as Error).message }, 'VLM call failed');
      return [];
    }
  }

  private findClassifier(name: string): ObjectClassifier | undefined {
    return this.classifiers.find((c) => c.name === name);
  }
}
