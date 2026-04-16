import { randomUUID } from 'node:crypto';
import { FlorenceDetector } from '../providers/florence.detector';
import { ObjectClassifier, ClassifiedObject } from '../providers/classifier.interface';
import { BoundingBoxResult } from '../providers/detector.interface';
import { PhotoStorageService } from './photo-storage.service';
import { PipelineExecutor, PipelineStep } from './pipeline-executor';
import { logger } from '../utils/logger';
import { trace } from '@opentelemetry/api';

const MAX_ENRICHMENT_ITEMS = 25;

export interface DetectResultItem {
  id: string;
  label: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  attributes: {
    name: string;
    category: string;
    color: string | null;
    material: string | null;
    condition: string | null;
    estimated_value: string | null;
    description: string;
    search_tags: string[];
  };
}

export interface DetectResult {
  photoId: string;
  photoUrl: string;
  itemCount: number;
  items: DetectResultItem[];
  errors: Array<{ step: string; code: string; message: string; retryable: boolean }>;
  traceId: string;
  processingMs: number;
}

export class FlorencePipelineService {
  constructor(
    private readonly storage: PhotoStorageService,
    private readonly detector: FlorenceDetector,
    private readonly classifier: ObjectClassifier,
  ) {}

  async detect(imageBuffer: Buffer): Promise<DetectResult> {
    const traceId = trace.getActiveSpan()?.spanContext().traceId ?? randomUUID().replace(/-/g, '');

    const steps: PipelineStep[] = [
      {
        name: 'save-photo',
        fn: async (ctx) => {
          const saved = await this.storage.save(imageBuffer);
          return { ...ctx, photoId: saved.photoId, photoPath: saved.photoPath };
        },
        retry: 0,
        timeoutMs: 5_000,
      },
      {
        name: 'florence-detect',
        fn: async (ctx) => {
          const boxes = await this.detector.detect(imageBuffer);
          return { ...ctx, boxes };
        },
        retry: 2,
        timeoutMs: 30_000,
      },
      {
        name: 'qwen-enrich',
        fn: async (ctx) => {
          const boxes = ctx.boxes as BoundingBoxResult[];
          const toEnrich = boxes.slice(0, MAX_ENRICHMENT_ITEMS);
          const classified = await this.classifier.classify(imageBuffer, toEnrich);
          return { ...ctx, classified, enrichedCount: toEnrich.length };
        },
        retry: 1,
        timeoutMs: 60_000,
      },
    ];

    const result = await PipelineExecutor.run('detect-inventory', steps, {}, 'continue');
    const boxes = (result.context.boxes as BoundingBoxResult[] | undefined) ?? [];
    const classified = (result.context.classified as ClassifiedObject[] | undefined) ?? [];
    const photoId = (result.context.photoId as string | undefined) ?? 'unknown';

    const items: DetectResultItem[] = boxes.map((box, i) => {
      const enriched = classified.find((c) => c.boxIndex === i);
      if (enriched) {
        return this.buildEnrichedItem(enriched, box);
      }
      return this.buildBasicItem(box);
    });

    logger.info({
      photoId,
      totalDetected: boxes.length,
      enriched: classified.length,
      errors: result.errors.length,
      totalMs: result.totalMs,
      traceId,
    }, 'Pipeline complete');

    return {
      photoId,
      photoUrl: `/photos/${photoId}.jpg`,
      itemCount: items.length,
      items,
      errors: result.errors,
      traceId,
      processingMs: result.totalMs,
    };
  }

  private buildEnrichedItem(classified: ClassifiedObject, box: BoundingBoxResult): DetectResultItem {
    const tags = [
      classified.label,
      classified.category,
      ...(classified.colors ?? []),
      ...(classified.materials ?? []),
    ].filter(Boolean).map((t) => t.toLowerCase());

    return {
      id: randomUUID(),
      label: classified.label,
      confidence: classified.confidence,
      bbox: box.box,
      attributes: {
        name: classified.label,
        category: classified.category ?? 'household item',
        color: classified.colors?.[0] ?? null,
        material: classified.materials?.[0] ?? null,
        condition: classified.condition ?? null,
        estimated_value: classified.estimatedValue
          ? `${classified.estimatedValue.low}-${classified.estimatedValue.high}`
          : null,
        description: classified.description ?? `${classified.label} found in the room`,
        search_tags: [...new Set(tags)],
      },
    };
  }

  private buildBasicItem(box: BoundingBoxResult): DetectResultItem {
    return {
      id: randomUUID(),
      label: box.coarseLabel || 'Unknown item',
      confidence: box.confidence,
      bbox: box.box,
      attributes: {
        name: box.coarseLabel || 'Unknown item',
        category: 'household item',
        color: null,
        material: null,
        condition: null,
        estimated_value: null,
        description: `${box.coarseLabel || 'Item'} detected in the room`,
        search_tags: [box.coarseLabel?.toLowerCase() ?? 'item'],
      },
    };
  }

  async healthCheck(): Promise<Record<string, boolean>> {
    const florence = await this.detector.healthCheck();
    const classifier = await this.classifier.healthCheck();
    return { florence, [this.classifier.name]: classifier };
  }
}
