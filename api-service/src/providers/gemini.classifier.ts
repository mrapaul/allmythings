import { GoogleGenerativeAI } from '@google/generative-ai';
import { ObjectClassifier, ClassifiedObject } from './classifier.interface';
import { BoundingBoxResult } from './detector.interface';
import { EnvConfig } from '../config/env.config';
import { logger } from '../utils/logger';

export class GeminiClassifier implements ObjectClassifier {
  readonly name = 'gemini';
  private genAI: GoogleGenerativeAI;
  private modelId: string;

  constructor(config: EnvConfig) {
    this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
    this.modelId = config.geminiModel;
  }

  async classify(image: Buffer, _detections: BoundingBoxResult[]): Promise<ClassifiedObject[]> {
    const prompt = this.buildFullImagePrompt();

    // Use v1beta for reliable JSON mode support with models like gemini-2.5-flash
    const model = this.genAI.getGenerativeModel(
      { model: this.modelId },
      { apiVersion: 'v1beta' }
    );

    try {
      const result = await model.generateContent({
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: 'image/jpeg', data: image.toString('base64') } }
          ]
        }],
        generationConfig: {
          responseMimeType: 'application/json',
        }
      });

      const text = result.response.text();
      const json = this.extractJson(text);
      const parsed = JSON.parse(json);

      logger.debug({ 
        provider: this.name, 
        count: Array.isArray(parsed) ? parsed.length : 1,
        onePass: true
      }, 'Gemini classification finished');

      return (Array.isArray(parsed) ? parsed : [parsed])
        .map((item: any) => this.mapToClassifiedObject(item))
        .filter((obj: ClassifiedObject) => obj.confidence > 0.1);
    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Gemini classification failed');
      throw error;
    }
  }

  async generateDetectionPrompt(_image: Buffer): Promise<string> {
    return 'household item . furniture . appliance . electronic';
  }

  private buildFullImagePrompt(): string {
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

  private extractJson(text: string): string {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
    return jsonMatch ? jsonMatch[1].trim() : text.trim();
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
    return !!this.genAI;
  }
}
