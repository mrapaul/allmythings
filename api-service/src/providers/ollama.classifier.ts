import { ObjectClassifier, ClassifiedObject } from './classifier.interface';
import { BoundingBoxResult } from './detector.interface';
import { EnvConfig } from '../config/env.config';
import { logger } from '../utils/logger';

export class OllamaClassifier implements ObjectClassifier {
  readonly name = 'ollama';
  private readonly baseUrl: string;
  private readonly ollamaModel: string;
  private readonly timeoutMs: number;

  constructor(config: EnvConfig) {
    this.baseUrl = config.ollamaBaseUrl;
    this.ollamaModel = config.ollamaModel;
    this.timeoutMs = config.classificationTimeoutMs;
  }

  async classify(image: Buffer, detections: BoundingBoxResult[]): Promise<ClassifiedObject[]> {
    const prompt = detections.length > 0
      ? this.buildDetectionPrompt(detections)
      : this.buildFullImagePrompt();

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.ollamaModel,
        prompt,
        images: [image.toString('base64')],
        stream: false,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const data: any = await response.json();
    const text = data.response || '';
    const json = this.extractJson(text);
    const parsed = JSON.parse(json);

    logger.debug({ count: parsed.length }, 'OllamaClassifier: received classifications');

    return (Array.isArray(parsed) ? parsed : [parsed])
      .map((item: any) => this.mapToClassifiedObject(item, detections))
      .filter((obj: ClassifiedObject) => obj.confidence > 0);
  }

  private buildDetectionPrompt(detections: BoundingBoxResult[]): string {
    const boxes = detections.map((d, i) => ({ index: i, box: d.box, coarse_label: d.coarseLabel }));
    return `You are analyzing a photo for a home inventory application.\n\nObjects detected at:\n${JSON.stringify(boxes, null, 2)}\n\nFor each, return JSON array with: box_index, label, category, brand, model, colors, materials, condition, estimated_value_usd, description, confidence. Return valid JSON only.`;
  }

  private buildFullImagePrompt(): string {
    return `Analyze this image and identify all household objects you can see. Return a JSON array with: box_index, label, category, brand, model, colors, materials, condition, estimated_value_usd, description, confidence, bounding_box. Return valid JSON only.`;
  }

  private extractJson(text: string): string {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    const start = cleaned.indexOf('[');
    if (start !== -1) {
      const end = cleaned.lastIndexOf(']');
      if (end !== -1 && end > start) {
        return cleaned.slice(start, end + 1);
      }
      return cleaned.slice(start);
    }
    const objStart = cleaned.indexOf('{');
    if (objStart === -1) throw new Error('No JSON found in Ollama response');
    const objEnd = cleaned.lastIndexOf('}');
    if (objEnd !== -1 && objEnd > objStart) {
      return cleaned.slice(objStart, objEnd + 1);
    }
    return cleaned.slice(objStart);
  }

  private mapToClassifiedObject(item: any, detections: BoundingBoxResult[]): ClassifiedObject {
    const boxIndex = item.box_index ?? 0;
    const detection = detections[boxIndex];
    return {
      boxIndex,
      label: item.label || 'unknown',
      category: item.category || 'uncategorized',
      brand: item.brand || null,
      model: item.model || null,
      colors: item.colors || [],
      materials: item.materials || [],
      condition: item.condition || null,
      estimatedValue: item.estimated_value_usd || null,
      description: item.description || null,
      confidence: item.confidence ?? 0,
      boundingBox: detection?.box ?? item.bounding_box ?? { x: 0, y: 0, width: 0, height: 0 },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
