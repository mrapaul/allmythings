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
    
    try {
      const json = this.extractJson(text);
      const parsed = JSON.parse(json);

      logger.debug({ 
        provider: this.name, 
        count: Array.isArray(parsed) ? parsed.length : 1 
      }, 'OllamaClassifier: received classifications');

      return (Array.isArray(parsed) ? parsed : [parsed])
        .map((item: any) => this.mapToClassifiedObject(item, detections))
        .filter((obj: ClassifiedObject) => obj.confidence > 0);
    } catch (error) {
      logger.error({ error: (error as Error).message, text }, 'Ollama JSON parsing failed');
      return []; // Return empty instead of crashing
    }
  }

  async generateDetectionPrompt(image: Buffer): Promise<string> {
    const prompt = `List all identifiable specific household objects in this image. 
Be as specific as possible (e.g., "eames chair", "potted orchid", "macbook pro", "ikea shelf"). 
Return only a list of object names separated by dots, e.g. "sofa . floor lamp . art frame . coffee table".
Do not use generic categories like "furniture" or "item" if a more specific name is identifiable.`;

    try {
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

      if (!response.ok) return 'household item . furniture . appliance';

      const data: any = await response.json();
      const text = (data.response || '').trim();
      return text.toLowerCase().replace(/,/g, ' .').replace(/\n/g, ' .').replace(/\s+\.\s+/g, ' . ');
    } catch {
      return 'household item . furniture . appliance';
    }
  }

  private buildDetectionPrompt(detections: BoundingBoxResult[]): string {
    const boxes = detections.map((d, i) => ({ index: i, box: d.box, coarse_label: d.coarseLabel }));
    return `You are analyzing a photo for a home inventory application.

Objects detected at:
${JSON.stringify(boxes, null, 2)}

For each, return a minimal JSON array of objects with exactly 3 keys: "box_index" (number), "label" (string), "category" (string). Do not add descriptions or other fields to save time. Return valid JSON only.`;
  }

  private buildFullImagePrompt(): string {
    return `Analyze this image and identify all household objects you can see. Return a minimal JSON array of objects with: "box_index", "label", "category", "confidence", "bounding_box". Return valid JSON only.`;
  }

  private extractJson(text: string): string {
    try {
      // 1. Basic cleanup
      let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      
      // 2. Remove problematic control characters
      // eslint-disable-next-line no-control-regex
      cleaned = cleaned.replace(/[\x00-\x1F\x7F-\x9F]/g, ' ');

      // 3. Find the first '[' and last ']'
      const start = cleaned.indexOf('[');
      const end = cleaned.lastIndexOf(']');
      
      if (start !== -1 && end !== -1 && end > start) {
        const potentialJson = cleaned.slice(start, end + 1);
        try {
          JSON.parse(potentialJson);
          return potentialJson;
        } catch (e) {
          logger.warn({ error: (e as Error).message }, 'Initial JSON parse failed, attempting deep repair');
          return this.repairJson(potentialJson);
        }
      }
      
      throw new Error('No JSON array found in response');
    } catch (e) {
      logger.error({ text, error: (e as Error).message }, 'Failed to extract JSON from Ollama');
      throw e;
    }
  }

  private repairJson(json: string): string {
    // Escape backslashes that aren't followed by a valid escape char
    const repaired = json.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\');
    
    // Attempt to handle unescaped newlines in strings
    // This is complex, but a common issue. 
    // We'll just try to parse again.
    try {
      JSON.parse(repaired);
      return repaired;
    } catch {
      // If still failing, return a minimal valid empty array to avoid 503
      return '[]';
    }
  }

  private mapToClassifiedObject(item: any, detections: BoundingBoxResult[]): ClassifiedObject {
    const boxIndex = item.box_index ?? 0;
    const detection = detections[boxIndex];

    const label = item.label || detection?.coarseLabel || 'unknown';
    
    // Handle Ollama bounding box format: can be [y1, x1, y2, x2] or {x, y, width, height}
    let boundingBox = detection?.box ?? { x: 0, y: 0, width: 0, height: 0 };
    
    if (item.bounding_box) {
      if (Array.isArray(item.bounding_box) && item.bounding_box.length === 4) {
        // Ollama often returns [y1, x1, y2, x2] in normalized coordinates
        const [y1, x1, y2, x2] = item.bounding_box;
        boundingBox = {
          x: x1,
          y: y1,
          width: Math.abs(x2 - x1),
          height: Math.abs(y2 - y1),
        };
      } else if (typeof item.bounding_box === 'object') {
        boundingBox = {
          x: item.bounding_box.x ?? 0,
          y: item.bounding_box.y ?? 0,
          width: item.bounding_box.width ?? item.bounding_box.w ?? 0,
          height: item.bounding_box.height ?? item.bounding_box.h ?? 0,
        };
      }
    }

    return {
      boxIndex,
      label: this.capitalize(label),
      category: item.category || 'household item',
      brand: 'Generic',
      model: null,
      colors: [],
      materials: [],
      condition: 'good',
      estimatedValue: null,
      description: `A ${label.toLowerCase()} found in the room.`,
      confidence: item.confidence ?? (detection?.confidence || 0.8),
      boundingBox,
    };
  }

  private capitalize(s: string): string {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
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
