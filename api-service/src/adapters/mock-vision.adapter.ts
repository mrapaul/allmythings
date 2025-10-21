import { ProviderAdapter } from './provider-adapter.interface';
import { Detection } from '../schemas/detection.schema';

/**
 * Mock vision adapter for development/testing
 * Returns random but reasonable object detections
 */
export class MockVisionAdapter implements ProviderAdapter {
  name = 'mock';

  private mockObjects = [
    'chair', 'table', 'book', 'laptop', 'phone', 'cup', 'bottle', 'pen',
    'keyboard', 'mouse', 'monitor', 'lamp', 'backpack', 'wallet', 'watch',
    'sunglasses', 'headphones', 'camera', 'remote control', 'charger'
  ];

  async detectObjects(imageBuffer: Buffer): Promise<Detection[]> {
    // Simulate API latency
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    // Generate 1-3 random detections
    const numDetections = 1 + Math.floor(Math.random() * 3);
    const detections: Detection[] = [];

    for (let i = 0; i < numDetections; i++) {
      const randomObject = this.mockObjects[Math.floor(Math.random() * this.mockObjects.length)];

      detections.push({
        label: randomObject,
        confidence: 0.7 + Math.random() * 0.25, // 0.7-0.95
        boundingBox: {
          left: Math.random() * 0.3,
          top: Math.random() * 0.3,
          width: 0.2 + Math.random() * 0.4,
          height: 0.2 + Math.random() * 0.4,
        },
      });
    }

    return detections;
  }
}
