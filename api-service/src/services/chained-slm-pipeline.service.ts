import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { Pool } from 'pg';
import {
  BoundingBox,
  DetectedObject,
  DetectedObjectSchema,
  DynamicFacet,
  OpenProperties,
  TrainingFeedbackPair,
} from '../../../packages/contracts/src';

export interface SlmPipelineConfig {
  vllmBaseUrl: string;
  localizerEndpoint: string;
  embeddingEndpoint: string;
}

export class ChainedSlmPipelineService {
  constructor(
    private readonly db: Pool,
    private readonly config: SlmPipelineConfig
  ) {}

  async *runChainedDetection(
    imageBuffer: Buffer
  ): AsyncGenerator<DetectedObject, { runId: string; latencyMs: number }> {
    const startMs = performance.now();
    const runId = randomUUID();

    const metadata = await sharp(imageBuffer).metadata();
    const imgWidth = metadata.width ?? 1000;
    const imgHeight = metadata.height ?? 1000;

    const boxes = await this.stage1LocalizeObjects(imageBuffer);
    const { visionAdapter, taxonomyAdapter } = await this.getActiveLoraAdapters();

    const CONCURRENCY = 4;
    for (let i = 0; i < boxes.length; i += CONCURRENCY) {
      const batch = boxes.slice(i, i + CONCURRENCY);

      const batchResults = await Promise.all(
        batch.map(async (box) => {
          const cropBuffer = await this.cropBoundingBox(imageBuffer, box.box2d, imgWidth, imgHeight);
          const cropBase64 = cropBuffer.toString('base64');

          const embedding = await this.computeVisualEmbedding(cropBase64);
          const fewShotMemory = await this.retrieveSimilarUserEdits(embedding, 3);

          const extracted = await this.stage2ExtractProperties(
            cropBase64,
            fewShotMemory,
            visionAdapter
          );
          if (!extracted || extracted.isBackgroundFixture) return null;

          const facet = await this.stage3AssignDynamicFacetAndGlyph(
            extracted.name,
            extracted.properties,
            extracted.labels,
            taxonomyAdapter
          );

          const candidate: DetectedObject = {
            id: randomUUID(),
            name: extracted.name,
            confidence: box.confidence,
            box2d: box.box2d,
            properties: extracted.properties,
            labels: this.normalizeDynamicLabels(extracted.name, extracted.properties, extracted.labels),
            facet,
          };

          const parsed = DetectedObjectSchema.safeParse(candidate);
          return parsed.success ? parsed.data : null;
        })
      );

      for (const item of batchResults) {
        if (item) yield item;
      }
    }

    return {
      runId,
      latencyMs: Math.round(performance.now() - startMs),
    };
  }

  private async stage1LocalizeObjects(
    imageBuffer: Buffer
  ): Promise<Array<{ box2d: BoundingBox; confidence: number }>> {
    const res = await fetch(this.config.localizerEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: imageBuffer,
    });
    if (!res.ok) {
      throw new Error(`Stage 1 Localizer failed with status ${res.status}`);
    }
    const data = (await res.json()) as {
      regions: Array<{ box2d: BoundingBox; score: number }>;
    };
    return data.regions
      .filter((r) => r.score >= 0.42)
      .map((r) => ({ box2d: r.box2d, confidence: r.score }));
  }

  private async stage2ExtractProperties(
    cropBase64: string,
    fewShotExamples: Array<{ chosen: any; rejected: any }>,
    loraAdapterName: string
  ): Promise<{
    isBackgroundFixture: boolean;
    name: string;
    properties: OpenProperties;
    labels: string[];
  } | null> {
    const memoryContext =
      fewShotExamples.length > 0
        ? `USER-CALIBRATED EXAMPLES FROM THIS HOME:\n` +
          fewShotExamples
            .map(
              (ex) =>
                `- Instead of ${JSON.stringify(ex.rejected.labels)}, user labeled similar item: name="${ex.chosen.name}", properties=${JSON.stringify(ex.chosen.properties)}, labels=${JSON.stringify(ex.chosen.labels)}`
            )
            .join('\n')
        : '';

    const response = await fetch(`${this.config.vllmBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: loraAdapterName,
        temperature: 0.1,
        max_tokens: 320,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              `You are a specialized home-inventory vision model trained to identify physical possessions and their granular searchable properties.`,
              `Do NOT use generic or fixed categories. Discover the most specific, accurate attributes visible.`,
              `If the crop is purely a wall, floor, ceiling, window frame, or shadow, set "isBackgroundFixture": true.`,
              `Respond strictly in JSON: {"isBackgroundFixture": boolean, "name": string, "properties": Record<string, string>, "labels": string[]}.`,
              memoryContext,
            ].join('\n'),
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${cropBase64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) return null;
    const json = (await response.json()) as any;
    try {
      return JSON.parse(json.choices[0].message.content);
    } catch {
      return null;
    }
  }

  private async stage3AssignDynamicFacetAndGlyph(
    name: string,
    properties: OpenProperties,
    labels: string[],
    loraAdapterName: string
  ): Promise<DynamicFacet> {
    const response = await fetch(`${this.config.vllmBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: loraAdapterName,
        temperature: 0.0,
        max_tokens: 120,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              `You are a specialized UI Taxonomy & Iconography model.`,
              `Given an item's name, open properties, and labels, output:`,
              `1. "facetId": a concise, lowercase emergent group label (1 word).`,
              `2. "glyphName": the most semantically accurate Ionicons outline icon name.`,
              `3. "accentHex": a 6-digit hex color matching the item's primary physical color property.`,
              `Output strictly JSON: {"facetId": string, "glyphName": string, "accentHex": "#RRGGBB"}.`,
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify({ name, properties, labels }),
          },
        ],
      }),
    });

    if (response.ok) {
      try {
        const body = (await response.json()) as any;
        const parsed = JSON.parse(body.choices[0].message.content);
        if (parsed.facetId && parsed.glyphName) {
          return {
            facetId: String(parsed.facetId).toLowerCase().trim(),
            glyphName: String(parsed.glyphName).toLowerCase().trim(),
            accentHex: /^#[0-9A-Fa-f]{6}$/.test(parsed.accentHex) ? parsed.accentHex : '#A1A1AA',
          };
        }
      } catch {
        // Fallback below
      }
    }

    return {
      facetId: labels[0] ?? 'item',
      glyphName: 'shapes-outline',
      accentHex: '#A1A1AA',
    };
  }

  async ingestUserPreSaveTrainingPair(pair: TrainingFeedbackPair, cropDiskPath: string): Promise<void> {
    const embedding = await this.computeVisualEmbedding(pair.cropBase64);
    const vectorLiteral = `[${embedding.join(',')}]`;

    const isEdited =
      JSON.stringify([...pair.modelPrediction.labels].sort()) !==
        JSON.stringify([...pair.userVerified.labels].sort()) ||
      pair.modelPrediction.name !== pair.userVerified.name ||
      pair.wasRejectedFalsePositive;

    await this.db.query(
      `INSERT INTO slm_training_samples 
        (run_id, crop_storage_path, visual_embedding, rejected_output, chosen_output, is_edited)
       VALUES ($1, $2, $3::vector, $4, $5, $6)`,
      [
        pair.runId,
        cropDiskPath,
        vectorLiteral,
        JSON.stringify(pair.modelPrediction),
        JSON.stringify(pair.userVerified),
        isEdited,
      ]
    );
  }

  private async retrieveSimilarUserEdits(
    embedding: number[],
    limit: number
  ): Promise<Array<{ chosen: any; rejected: any }>> {
    const vectorLiteral = `[${embedding.join(',')}]`;
    const { rows } = await this.db.query(
      `SELECT chosen_output, rejected_output
       FROM slm_training_samples
       WHERE 1 - (visual_embedding <=> $1::vector) > 0.74
       ORDER BY is_edited DESC, visual_embedding <=> $1::vector ASC
       LIMIT $2`,
      [vectorLiteral, limit]
    );
    return rows.map((r) => ({ chosen: r.chosen_output, rejected: r.rejected_output }));
  }

  private async getActiveLoraAdapters(): Promise<{
    visionAdapter: string;
    taxonomyAdapter: string;
  }> {
    const { rows } = await this.db.query(
      `SELECT model_stage, adapter_name FROM slm_adapter_versions WHERE is_active = TRUE`
    );
    const vision =
      rows.find((r) => r.model_stage === 'vision_extractor')?.adapter_name ??
      'qwen2.5-vl-3b-inventory-lora-v1';
    const taxonomy =
      rows.find((r) => r.model_stage === 'taxonomy_icon')?.adapter_name ??
      'qwen2.5-1.5b-taxonomy-lora-v1';
    return { visionAdapter: vision, taxonomyAdapter: taxonomy };
  }

  private async computeVisualEmbedding(cropBase64: string): Promise<number[]> {
    const res = await fetch(this.config.embeddingEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: cropBase64 }),
    });
    if (!res.ok) return new Array(768).fill(0);
    const data = (await res.json()) as { embedding: number[] };
    return data.embedding;
  }

  private async cropBoundingBox(
    imageBuffer: Buffer,
    box: BoundingBox,
    imgWidth: number,
    imgHeight: number
  ): Promise<Buffer> {
    const left = Math.max(0, Math.floor((box.xmin / 1000) * imgWidth));
    const top = Math.max(0, Math.floor((box.ymin / 1000) * imgHeight));
    const width = Math.max(
      16,
      Math.min(imgWidth - left, Math.ceil(((box.xmax - box.xmin) / 1000) * imgWidth))
    );
    const height = Math.max(
      16,
      Math.min(imgHeight - top, Math.ceil(((box.ymax - box.ymin) / 1000) * imgHeight))
    );

    return sharp(imageBuffer)
      .extract({ left, top, width, height })
      .resize(448, 448, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
  }

  private normalizeDynamicLabels(
    name: string,
    properties: OpenProperties,
    rawLabels: string[]
  ): string[] {
    const tokens = [name, ...Object.values(properties), ...rawLabels]
      .flatMap((v) => v.toLowerCase().trim().split(/[\s,;/]+/))
      .map((t) => t.replace(/[^a-z0-9-_+#]/g, ''))
      .filter((t) => t.length > 1);

    return Array.from(new Set(tokens));
  }
}
