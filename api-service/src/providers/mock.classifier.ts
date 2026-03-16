import { ObjectClassifier, ClassifiedObject } from './classifier.interface';
import { BoundingBoxResult } from './detector.interface';

/**
 * Mock classifier for automated testing and CI verification
 * Returns deterministic results for known test images
 */
export class MockClassifier implements ObjectClassifier {
  readonly name = 'mock-ai';

  async classify(_image: Buffer, _detections: BoundingBoxResult[]): Promise<ClassifiedObject[]> {
    // Artificial delay to simulate processing
    await new Promise(resolve => setTimeout(resolve, 1500));

    return [
      {
        boxIndex: 0,
        label: 'Yellow Upholstered Armchair',
        category: 'Furniture',
        brand: 'West Elm',
        model: 'Findley',
        colors: ['Yellow'],
        materials: ['Fabric', 'Wood'],
        condition: 'good',
        estimatedValue: { low: 300, high: 500 },
        description: 'A stylish yellow armchair with wooden legs.',
        confidence: 0.98,
        boundingBox: { x: 0.335, y: 0.485, width: 0.3, height: 0.31 }
      },
      {
        boxIndex: 1,
        label: 'Modern Gold Floor Lamp',
        category: 'Lighting',
        brand: null,
        model: null,
        colors: ['Gold'],
        materials: ['Brass'],
        condition: 'new',
        estimatedValue: { low: 150, high: 250 },
        description: 'Mid-century modern style floor lamp.',
        confidence: 0.95,
        boundingBox: { x: 0.235, y: 0.195, width: 0.19, height: 0.74 }
      }
    ];
  }

  async generateDetectionPrompt(_image: Buffer): Promise<string> {
    return 'mock prompt';
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
