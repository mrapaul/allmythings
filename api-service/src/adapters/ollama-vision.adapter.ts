import { ProviderAdapter } from './provider-adapter.interface';
import { Detection, BoundingBox } from '../schemas/detection.schema';
import { envConfig } from '../config/env.config';
import { logger } from '../utils/logger';

/**
 * Ollama Vision Adapter
 * Uses local multimodal models (like LLaVA) via Ollama
 */
export class OllamaVisionAdapter implements ProviderAdapter {
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = envConfig.ollamaBaseUrl;
    this.model = envConfig.ollamaModel;
  }

  async detectObjects(imageBuffer: Buffer): Promise<Detection[]> {
    try {
      const base64Image = imageBuffer.toString('base64');
      
      const prompt = `
        Analyze this image and identify the items in it for a home inventory.
        Return a JSON array where each object has:
        - "label": Name of the item
        - "category": Category (Furniture, Electronics, etc.)
        - "confidence": 0.0 to 1.0
        - "box_2d": [ymin, xmin, ymax, xmax] coordinates (0-100 scale) if possible, otherwise null.
        
        Example:
        [{"label": "Sofa", "category": "Furniture", "confidence": 0.9, "box_2d": [20, 10, 80, 90]}]
        
        Output ONLY valid JSON.
      `;

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: prompt,
          images: [base64Image],
          stream: false,
          format: "json" 
        }),
      });

      if (!response.ok) {
        // If 404, maybe model not pulled?
        logger.warn(`Ollama API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data: any = await response.json();
      let detections: any[] = [];
      
      try {
        // LLaVA often outputs text before/after JSON
        const jsonStr = data.response;
        // Try to find array bracket
        const firstBracket = jsonStr.indexOf('[');
        const lastBracket = jsonStr.lastIndexOf(']');
        
        if (firstBracket !== -1 && lastBracket !== -1) {
             const jsonPart = jsonStr.substring(firstBracket, lastBracket + 1);
             detections = JSON.parse(jsonPart);
        } else {
             detections = JSON.parse(jsonStr);
        }
      } catch (e) {
        logger.warn({ response: data.response }, 'Failed to parse Ollama JSON');
        return [];
      }

      if (!Array.isArray(detections)) return [];

      return detections.map((d: any) => {
        // Handle bounding box normalization
        let box: BoundingBox = { x: 0, y: 0, width: 1, height: 1 };
        if (d.box_2d && Array.isArray(d.box_2d) && d.box_2d.length === 4) {
             // Assuming 0-100 scale from prompt
             const [ymin, xmin, ymax, xmax] = d.box_2d;
             // Clamp 0-100
             const clamp = (n: number) => Math.max(0, Math.min(100, n));
             const y1 = clamp(ymin) / 100;
             const x1 = clamp(xmin) / 100;
             const y2 = clamp(ymax) / 100;
             const x2 = clamp(xmax) / 100;
             
             box = {
                 x: x1,
                 y: y1,
                 width: Math.max(0, x2 - x1),
                 height: Math.max(0, y2 - y1)
             };
        }

        return {
          id: `ollama-${Math.random().toString(36).substr(2, 9)}`,
          label: d.label || 'unknown',
          category: d.category,
          confidence: d.confidence || 0.8,
          boundingBox: box,
          ensembleDetails: {
            providerAgreement: 1,
            confidenceByProvider: { ollama: d.confidence || 0.8 },
            labelConsensus: 'single-provider'
          },
          alternativeLabels: []
        };
      });

    } catch (error) {
      logger.error({ error }, 'Ollama detection failed');
      return [];
    }
  }

  health(): Promise<boolean> {
    return fetch(`${this.baseUrl}/api/tags`)
      .then(r => r.ok)
      .catch(() => false);
  }

  getName(): string {
    return 'ollama';
  }
}