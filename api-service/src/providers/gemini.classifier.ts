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
    return `Perform a high-end visual inventory of this interior space. 
For EVERY identifiable object, return a JSON array of objects with:
1. label: Specific name (e.g. "Red Velvet Dining Chair", "Silver Teapot").
2. category: One of [Furniture, Lighting, Textiles, Wall Decor, Home Decor, Kitchenware, Books, Plants, Electronics].
3. colors: Array of primary colors.
4. materials: Array of specific materials (e.g. ["brass", "copper", "velvet", "faux fur", "shag", "marble", "glass", "wood"]).
5. condition: "new" or "good".
6. description: A brief spatial location (e.g. "On the bistro table").
7. confidence: 0.0 to 1.0.
8. bounding_box: [ymin, xmin, ymax, xmax] in normalized 0-1000 coordinates.

CRITICAL: Look for small items on tables (sugar bowls, tea cups, miniature vases) and textiles draped over furniture (fur throws, patterned pillows).
Return ONLY valid JSON.`;
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
      estimatedValue: null,
      description: item.description || null,
      confidence: item.confidence ?? 0,
      boundingBox,
    };
  }

  async healthCheck(): Promise<boolean> {
    return !!this.genAI;
  }
}
