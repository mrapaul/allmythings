import type { DetectedItem } from '../types/detected-item';
import {
  buildPass1Prompt,
  buildPass2Prompt,
  stripAndParseJson,
  salvageObjects,
  extractCorners,
  inferCoordMode,
  cornersToNormBox,
  rawItemToDetectedItem,
  dedupeItems,
  type CoordMode,
} from './vlm-detector.parse';

export interface QwenVisionOptions {
  twoPass: boolean;
  maxImageSize: number;
  coordMode: CoordMode | 'auto';
  confidenceThreshold: number;
  endpoint?: string;
  apiKey?: string;
}

interface PreparedImage {
  base64: string;
  width: number;
  height: number;
}

export class QwenVisionAdapter {
  private readonly endpoint: string;
  private readonly apiKey: string;

  constructor(private readonly opts: QwenVisionOptions) {
    this.endpoint = opts.endpoint || 'http://localhost:8000/v1/chat/completions';
    this.apiKey = opts.apiKey || '';
  }

  async detect(imageBuffer: Buffer): Promise<DetectedItem[]> {
    const items: DetectedItem[] = [];
    for await (const item of this.detectStream(imageBuffer)) {
      items.push(item);
    }
    return items;
  }

  async *detectStream(imageBuffer: Buffer): AsyncGenerator<DetectedItem> {
    const img = await this.prepareImage(imageBuffer);

    const pass1Raw = await this.callQwenVision(
      buildPass1Prompt(img.width, img.height),
      img.base64,
    );
    const pass1Items = this.parsePass(pass1Raw, img, 'items');
    const seen: DetectedItem[] = [];
    
    for (const item of pass1Items.detected) {
      if ((item.confidence ?? 0) >= this.opts.confidenceThreshold) {
        const deduped = dedupeItems([...seen, item]);
        if (deduped.length > seen.length) {
          seen.push(item);
          yield item;
        }
      }
    }

    if (!this.opts.twoPass) return;

    try {
      const pass2Raw = await this.callQwenVision(
        buildPass2Prompt(img.width, img.height, pass1Items.rawForAudit),
        img.base64,
      );
      const pass2Items = this.parsePass(pass2Raw, img, 'new_items');
      
      for (const item of pass2Items.detected) {
        if ((item.confidence ?? 0) >= this.opts.confidenceThreshold) {
          const deduped = dedupeItems([...seen, item]);
          if (deduped.length > seen.length) {
            seen.push(item);
            yield item;
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`qwen_pass2_failed: ${msg}`);
    }
  }

  private async callQwenVision(prompt: string, base64Image: string): Promise<string> {
    const endpoint = this.endpoint;
    const apiKey = this.apiKey;

    const payload = {
      model: 'Qwen/Qwen2.5-VL-3B-Instruct',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
          ],
        },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`QwenVision API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No content in QwenVision response');
      }

      return content;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`QwenVision inference failed: ${msg}`);
    }
  }

  private parsePass(
    raw: string,
    img: PreparedImage,
    itemsKey: 'items' | 'new_items',
  ): { detected: DetectedItem[]; rawForAudit: Array<{ id?: number; object?: string }> } {
    let rawItems: unknown[] = [];
    try {
      rawItems = this.extractItemArray(stripAndParseJson(raw), itemsKey);
    } catch {
      const salvaged = salvageObjects(raw);
      if (salvaged.length > 0) {
        console.warn(`qwen_salvaged_truncated_json: ${salvaged.length} items`);
        rawItems = salvaged;
      }
    }

    const allCorners: number[][] = [];
    for (const it of rawItems) {
      const c = extractCorners((it as Record<string, unknown>)?.bounding_box ?? (it as Record<string, unknown>)?.bbox_2d ?? (it as Record<string, unknown>)?.box);
      if (c) allCorners.push(c);
    }
    const mode =
      this.opts.coordMode === 'auto'
        ? inferCoordMode(allCorners, img.width, img.height)
        : this.opts.coordMode;

    const detected: DetectedItem[] = [];
    const rawForAudit: Array<{ id?: number; object?: string }> = [];
    for (const it of rawItems) {
      const o = it as Record<string, unknown>;
      rawForAudit.push({
        id: typeof o.id === 'number' ? o.id : undefined,
        object: typeof o.object === 'string' ? o.object : undefined,
      });
      const corners = extractCorners(o.bounding_box ?? o.bbox_2d ?? o.box);
      const box = corners ? cornersToNormBox(corners, mode, img.width, img.height) : null;
      const item = rawItemToDetectedItem(o, box);
      if (item) detected.push(item);
    }
    return { detected, rawForAudit };
  }

  private extractItemArray(parsed: unknown, itemsKey: string): unknown[] {
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      const o = parsed as Record<string, unknown>;
      if (Array.isArray(o[itemsKey])) return o[itemsKey] as unknown[];
      if (Array.isArray(o.items)) return o.items as unknown[];
      if (Array.isArray(o.new_items)) return o.new_items as unknown[];
      if (Array.isArray(o.objects)) return o.objects as unknown[];
    }
    return [];
  }

  private async prepareImage(buffer: Buffer): Promise<PreparedImage> {
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
