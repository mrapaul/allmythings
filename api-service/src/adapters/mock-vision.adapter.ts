import { ProviderAdapter } from './provider-adapter.interface';
import { Detection } from '../schemas/detection.schema';

/**
 * Mock vision adapter for development/testing
 * Returns comprehensive object detections simulating real vision AI
 * Detects 15-25 objects per image with realistic confidence scores and positioning
 */
export class MockVisionAdapter implements ProviderAdapter {
  name = 'mock';

  private objectDatabase = {
    // Furniture
    sofa: { confidence: 0.95, color: 'burgundy' },
    chair: { confidence: 0.92, color: 'rose' },
    armchair: { confidence: 0.91, color: 'pink' },
    table: { confidence: 0.93, color: 'wood' },
    'coffee table': { confidence: 0.92, color: 'gray' },
    'dining table': { confidence: 0.91, color: 'wood' },
    'console table': { confidence: 0.88, color: 'gold' },

    // Lighting
    lamp: { confidence: 0.90, color: 'brass' },
    'pendant light': { confidence: 0.89, color: 'glass' },
    'table lamp': { confidence: 0.87, color: 'orange' },
    chandelier: { confidence: 0.85, color: 'crystal' },
    'wall sconce': { confidence: 0.86, color: 'brass' },

    // Decor & Accessories
    'throw pillow': { confidence: 0.84, color: 'burgundy' },
    'decorative pillow': { confidence: 0.83, color: 'gold' },
    'area rug': { confidence: 0.91, color: 'beige' },
    painting: { confidence: 0.89, color: 'abstract' },
    'wall art': { confidence: 0.88, color: 'brown' },
    plant: { confidence: 0.87, color: 'green' },
    'potted plant': { confidence: 0.86, color: 'green' },
    vase: { confidence: 0.82, color: 'gold' },
    sculpture: { confidence: 0.80, color: 'bronze' },

    // Window & Doors
    window: { confidence: 0.94, color: 'glass' },
    door: { confidence: 0.93, color: 'burgundy' },
    'door handle': { confidence: 0.85, color: 'gold' },

    // Textiles & Soft Furnishings
    curtain: { confidence: 0.88, color: 'blue' },
    'throw blanket': { confidence: 0.81, color: 'cream' },
  };

  async detectObjects(_imageBuffer: Buffer): Promise<Detection[]> {
    // Simulate API latency (more realistic for processing multiple objects)
    await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 100));

    // Generate 15-25 detections for a comprehensive scene
    const numDetections = 15 + Math.floor(Math.random() * 11);
    const detections: Detection[] = [];
    const usedObjects = new Set<string>();

    // Define zones for more realistic object placement
    const zones = [
      { x: 0.0, y: 0.0, w: 0.3, h: 0.5 },   // Left zone
      { x: 0.3, y: 0.0, w: 0.4, h: 0.5 },   // Center zone
      { x: 0.7, y: 0.0, w: 0.3, h: 0.5 },   // Right zone
      { x: 0.0, y: 0.5, w: 0.5, h: 0.5 },   // Bottom left
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },   // Bottom right
    ];

    for (let i = 0; i < numDetections; i++) {
      const objectKeys = Object.keys(this.objectDatabase);
      let objectKey: string;
      let attempts = 0;

      // Allow some duplicates but prevent too many repeats
      do {
        objectKey = objectKeys[Math.floor(Math.random() * objectKeys.length)];
        attempts++;
      } while (usedObjects.has(objectKey) && attempts < 3);

      usedObjects.add(objectKey);
      const objectInfo = this.objectDatabase[objectKey as keyof typeof this.objectDatabase];

      // Vary confidence slightly
      const confidence = Math.max(0.7, Math.min(0.98, objectInfo.confidence + (Math.random() - 0.5) * 0.1));

      // Select a zone for placement
      const zone = zones[Math.floor(Math.random() * zones.length)];
      const objectWidth = 0.1 + Math.random() * 0.25;
      const objectHeight = 0.1 + Math.random() * 0.25;

      detections.push({
        id: `mock-${Math.random().toString(36).substr(2, 9)}`,
        label: objectKey,
        confidence,
        boundingBox: {
          x: zone.x + Math.random() * (zone.w - objectWidth),
          y: zone.y + Math.random() * (zone.h - objectHeight),
          width: objectWidth,
          height: objectHeight,
        },
        ensembleDetails: {
          providerAgreement: 1,
          confidenceByProvider: { mock: confidence },
          labelConsensus: 'single-provider',
        },
        alternativeLabels: [],
      });
    }

    return detections;
  }

  health(): Promise<boolean> {
    return Promise.resolve(true);
  }

  getName(): string {
    return this.name;
  }
}
