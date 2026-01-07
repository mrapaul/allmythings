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
        Analyze this image and list the main inventory items (furniture, electronics, decor).
        Return ONLY a JSON array. Do not use markdown blocks.
        
        Each item must have:
        - "label": A short descriptive name (string)
        - "category": The item category (string)
        - "confidence": A number between 0.0 and 1.0
        - "box_2d": An array of 4 integers [ymin, xmin, ymax, xmax] normalized to 0-100.
        
        Example:
        [{"label": "Wooden Chair", "category": "Furniture", "confidence": 0.9, "box_2d": [50, 10, 90, 40]}]
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
      
      // Log raw response for debugging
      logger.info({ rawResponse: data.response }, 'Ollama Raw Output');

      let detections: any[] = [];
      
      try {
        // LLaVA often outputs text before/after JSON
        const jsonStr = data.response.trim();
        
        let firstOpen = -1;
        let lastClose = -1;
        
        // Find the outer-most JSON structure (either [] or {})
        const firstSquare = jsonStr.indexOf('[');
        const firstCurly = jsonStr.indexOf('{');
        
        if (firstSquare !== -1 && (firstCurly === -1 || firstSquare < firstCurly)) {
            // Array starts first
            firstOpen = firstSquare;
            lastClose = jsonStr.lastIndexOf(']');
        } else if (firstCurly !== -1) {
            // Object starts first
            firstOpen = firstCurly;
            lastClose = jsonStr.lastIndexOf('}');
        }
        
        if (firstOpen !== -1 && lastClose !== -1) {
             const jsonPart = jsonStr.substring(firstOpen, lastClose + 1);
             detections = JSON.parse(jsonPart);
        } else {
             detections = JSON.parse(jsonStr);
        }
      } catch (e) {
        logger.warn({ response: data.response }, 'Failed to parse Ollama JSON');
        return [];
      }

      if (!Array.isArray(detections)) {
          if (typeof detections === 'object' && detections !== null) {
              detections = [detections];
          } else {
              return [];
          }
      }

      return detections.map((d: any) => {
        logger.info({ item: d }, 'Ollama detection item');
        
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