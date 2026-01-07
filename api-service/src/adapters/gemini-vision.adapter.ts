import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { ProviderAdapter } from './provider-adapter.interface';
import { Detection, BoundingBox } from '../schemas/detection.schema';
import { CircuitBreaker, CircuitState } from '../utils/circuit-breaker';
import { envConfig } from '../config/env.config';
import { logger } from '../utils/logger';

/**
 * Gemini Vision API adapter
 * Uses Google's Gemini 1.5 Flash model for open-vocabulary object detection
 */
export class GeminiVisionAdapter implements ProviderAdapter {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.genAI = new GoogleGenerativeAI(envConfig.geminiApiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    this.circuitBreaker = new CircuitBreaker('gemini-vision', {
      failureThreshold: 5,
      resetTimeout: 60000,
      halfOpenRequests: 3,
    });
  }

  async detectObjects(imageBuffer: Buffer): Promise<Detection[]> {
    return this.circuitBreaker.execute(async () => {
      try {
        const prompt = `
          Analyze this image and detect all distinct objects suitable for a home inventory.
          Focus on furniture, appliances, electronics, decor, and personal items.
          Ignore structural elements like walls, floors, and ceilings unless they have distinct features.
          
          Return a JSON array of objects. Each object must have:
          - "label": Specific name of the item (e.g., "Eames Chair", "Sony TV", "Vase").
          - "category": Broad category (e.g., "Furniture", "Electronics", "Decor").
          - "confidence": Estimated confidence score (0.0 to 1.0).
          - "box_2d": Bounding box [ymin, xmin, ymax, xmax] using 0-1000 scale.
          - "attributes": Key-value pairs for details like "brand", "model", "material", "color", "condition" (e.g., "new", "used", "antique").
          
          Example:
          [
            {
              "label": "Coffee Table", 
              "category": "Furniture", 
              "confidence": 0.95, 
              "box_2d": [500, 200, 700, 800],
              "attributes": {
                "material": "oak wood",
                "color": "dark brown",
                "condition": "good"
              }
            }
          ]
          
          Output ONLY valid JSON.
        `;

        const imagePart = {
          inlineData: {
            data: imageBuffer.toString('base64'),
            mimeType: 'image/jpeg', // Assuming JPEG, but could be PNG. Gemini handles it.
          },
        };

        const result = await this.model.generateContent([prompt, imagePart]);
        const response = result.response;
        const text = response.text();

        // Clean up markdown code blocks if present
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let parsedResult: any[];
        try {
            parsedResult = JSON.parse(jsonStr);
        } catch (e) {
            logger.warn({ error: e, text }, 'Failed to parse Gemini JSON response');
            return [];
        }

        if (!Array.isArray(parsedResult)) {
            return [];
        }

        const detections: Detection[] = parsedResult.map((item: any) => {
            const [ymin, xmin, ymax, xmax] = item.box_2d || [0, 0, 0, 0];
            
            // Normalize to 0-1
            const normalizedBox: BoundingBox = {
                x: xmin / 1000,
                y: ymin / 1000,
                width: (xmax - xmin) / 1000,
                height: (ymax - ymin) / 1000
            };

            return {
                id: `gemini-${Math.random().toString(36).substr(2, 9)}`,
                label: item.label || 'unknown',
                category: item.category,
                confidence: item.confidence || 0.0,
                boundingBox: normalizedBox,
                attributes: item.attributes || {},
                ensembleDetails: {
                    providerAgreement: 1,
                    confidenceByProvider: { gemini: item.confidence },
                    labelConsensus: 'single-provider',
                },
                alternativeLabels: [],
            };
        });

        logger.info(
          { detectionsCount: detections.length },
          'Gemini Vision detection complete'
        );
        return detections;

      } catch (error) {
        logger.error({ error }, 'Gemini Vision detection failed');
        throw error;
      }
    });
  }

  health(): Promise<boolean> {
    try {
        // Basic check if API key is present
        return Promise.resolve(!!envConfig.geminiApiKey && this.circuitBreaker.getState() !== CircuitState.OPEN);
    } catch {
      return Promise.resolve(false);
    }
  }

  getName(): string {
    return 'gemini';
  }
}
