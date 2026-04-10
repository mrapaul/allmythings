import Anthropic from '@anthropic-ai/sdk';
import { ObjectClassifier, ClassifiedObject } from './classifier.interface';
import { BoundingBoxResult } from './detector.interface';
import { EnvConfig } from '../config/env.config';
import { logger } from '../utils/logger';

export class ClaudeClassifier implements ObjectClassifier {
  readonly name = 'claude';
  private client: Anthropic;
  private modelId: string;

  constructor(config: EnvConfig) {
    this.client = new Anthropic({ apiKey: config.claudeApiKey });
    this.modelId = config.claudeModel;
  }

  async classify(image: Buffer, _detections: BoundingBoxResult[]): Promise<ClassifiedObject[]> {
    const prompt = this.buildPrompt();

    try {
      const response = await this.client.messages.create({
        model: this.modelId,
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: image.toString('base64') },
            },
            { type: 'text', text: prompt },
          ],
        }],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      return this.parseVlmResponse(text);
    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Claude classification failed');
      throw error;
    }
  }

  async generateDetectionPrompt(_image: Buffer): Promise<string> {
    return 'object . item . thing';
  }

  private buildPrompt(): string {
    return `Enumerate every visible object in this image. Return a JSON array where each element has:
- "label": specific descriptive name (e.g. "brass floor lamp", "ceramic coffee mug")
- "category": freeform category that fits the object
- "bounding_box": [ymin, xmin, ymax, xmax] in normalized 0-1000 coordinates
- "confidence": 0.0 to 1.0
- "colors": array of colors
- "materials": array of materials
- "condition": "new", "good", "fair", or "worn"
- "estimated_value_usd": rough estimate as integer

Be exhaustive — aim for completeness over brevity. Include small items on surfaces, textiles, wall decor, and anything partially visible. Use any label and category that fits the object.
Return ONLY valid JSON array, no other text.`;
  }

  parseVlmResponse(text: string): ClassifiedObject[] {
    const jsonStr = this.extractJson(text);
    const parsed = JSON.parse(jsonStr);
    const items = Array.isArray(parsed) ? parsed : [parsed];

    return items
      .map((item: any) => this.mapToClassifiedObject(item))
      .filter((obj: ClassifiedObject) => obj.confidence > 0.1);
  }

  private extractJson(text: string): string {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
    if (jsonMatch) return jsonMatch[1].trim();

    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end > start) return text.slice(start, end + 1);

    return text.trim();
  }

  private mapToClassifiedObject(item: any): ClassifiedObject {
    let boundingBox = { x: 0, y: 0, width: 0, height: 0 };

    if (item.bounding_box && Array.isArray(item.bounding_box) && item.bounding_box.length === 4) {
      const [ymin, xmin, ymax, xmax] = item.bounding_box;
      boundingBox = {
        x: xmin / 1000,
        y: ymin / 1000,
        width: (xmax - xmin) / 1000,
        height: (ymax - ymin) / 1000,
      };
    }

    return {
      boxIndex: 0,
      label: item.label || 'unknown',
      category: item.category || 'uncategorized',
      brand: item.brand || null,
      model: item.model || null,
      colors: item.colors || [],
      materials: item.materials || [],
      condition: item.condition || null,
      estimatedValue: item.estimated_value_usd
        ? { low: Math.round(item.estimated_value_usd * 0.7), high: Math.round(item.estimated_value_usd * 1.3) }
        : null,
      description: item.description || null,
      confidence: item.confidence ?? 0,
      boundingBox,
    };
  }

  async healthCheck(): Promise<boolean> {
    return !!this.client;
  }
}
