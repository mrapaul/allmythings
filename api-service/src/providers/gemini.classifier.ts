import { GoogleGenerativeAI } from '@google/generative-ai';
import { ObjectClassifier, ClassifiedObject } from './classifier.interface';
import { BoundingBoxResult } from './detector.interface';
import { EnvConfig } from '../config/env.config';
import { logger } from '../utils/logger';

export class GeminiClassifier implements ObjectClassifier {
  readonly name = 'gemini';
  private model: any;

  constructor(config: EnvConfig) {
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    this.model = genAI.getGenerativeModel({ model: config.geminiModel });
  }

  async classify(image: Buffer, detections: BoundingBoxResult[]): Promise<ClassifiedObject[]> {
    const prompt = detections.length > 0
      ? this.buildDetectionPrompt(detections)
      : this.buildFullImagePrompt();

    const result = await this.model.generateContent([
      prompt,
      { inlineData: { mimeType: 'image/jpeg', data: image.toString('base64') } },
    ]);

    const text = result.response.text();
    const json = this.extractJson(text);
    const parsed = JSON.parse(json);

    logger.debug({ count: parsed.length }, 'GeminiClassifier: received classifications');

    return (Array.isArray(parsed) ? parsed : [parsed])
      .map((item: any) => this.mapToClassifiedObject(item, detections))
      .filter((obj: ClassifiedObject) => obj.confidence > 0);
  }

  private buildDetectionPrompt(detections: BoundingBoxResult[]): string {
    const boxes = detections.map((d, i) => ({
      index: i, box: d.box, coarse_label: d.coarseLabel,
    }));
    return `You are analyzing a photo for a home inventory application.\n\nObjects have been detected at these locations (normalized 0-1 coordinates):\n${JSON.stringify(boxes, null, 2)}\n\nFor each detected object, return a JSON array:\n[\n  {\n    "box_index": 0,\n    "label": "specific name, e.g. 'standing desk lamp' not just 'lamp'",\n    "category": "descriptive category, e.g. 'living room furniture'",\n    "brand": "if identifiable from visual cues, else null",\n    "model": "if identifiable, else null",\n    "colors": ["primary color", "secondary if applicable"],\n    "materials": ["primary material", "secondary if applicable"],\n    "condition": "new | like-new | good | fair | poor",\n    "estimated_value_usd": { "low": number, "high": number } or null,\n    "description": "one-sentence description of the item",\n    "confidence": 0.0 to 1.0\n  }\n]\n\nRules:\n- Be as specific as possible with labels\n- Only describe objects you can actually see clearly\n- Do not guess brands — return null if unsure\n- Categories should be descriptive, not from a fixed list\n- If a detected region contains no identifiable object, return confidence: 0 for that box_index\n- Return valid JSON only, no markdown`;
  }

  private buildFullImagePrompt(): string {
    return `Analyze this image and identify all household objects you can see. For each object, estimate its bounding box as normalized 0-1 coordinates (x, y, width, height where x,y is top-left corner).\n\nReturn a JSON array with one entry per object:\n[\n  {\n    "box_index": 0,\n    "label": "specific name",\n    "category": "descriptive category",\n    "brand": "if identifiable, else null",\n    "model": "if identifiable, else null",\n    "colors": ["primary color"],\n    "materials": ["primary material"],\n    "condition": "new | like-new | good | fair | poor",\n    "estimated_value_usd": { "low": number, "high": number } or null,\n    "description": "one-sentence description",\n    "confidence": 0.0 to 1.0,\n    "bounding_box": { "x": 0.0, "y": 0.0, "width": 0.0, "height": 0.0 }\n  }\n]\n\nReturn valid JSON only, no markdown.`;
  }

  private extractJson(text: string): string {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    const start = cleaned.indexOf('[');
    if (start === -1) {
      const objStart = cleaned.indexOf('{');
      if (objStart === -1) throw new Error('No JSON found in VLM response');
      return cleaned.slice(objStart);
    }
    return cleaned.slice(start);
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
    return this.model !== null;
  }
}
