import { describe, it, expect } from 'vitest';
import { EnsembleFusionService } from '../../src/services/ensemble-fusion.service';
import { Detection } from '../../src/schemas/detection.schema';

describe.skipIf(!globalThis.__INTEGRATION_TESTS_ENABLED__)('EnsembleFusionService Integration Test', () => {
  const fusionService = new EnsembleFusionService();

  it('should merge overlapping detections from two providers', () => {
    const googleDetections: Detection[] = [
      {
        id: 'g1', label: 'Laptop', confidence: 0.95,
        boundingBox: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
        imageWidth: 1000, imageHeight: 1000,
      },
    ];

    const awsDetections: Detection[] = [
      {
        id: 'a1', label: 'Laptop Computer', confidence: 0.90,
        boundingBox: { x: 0.11, y: 0.11, width: 0.5, height: 0.5 }, // Overlapping box
        imageWidth: 1000, imageHeight: 1000,
      },
    ];

    const providerDetections = new Map<string, Detection[]>();
    providerDetections.set('google', googleDetections);
    providerDetections.set('aws', awsDetections);

    const fused = fusionService.fuseDetections(providerDetections);

    // Expect one merged detection
    expect(fused).toHaveLength(1);
    const finalDetection = fused[0];

    // Expect label to be from the highest confidence provider
    expect(finalDetection.label).toBe('laptop');

    // Expect confidence to be a weighted average (google: 0.3, aws: 0.25 by default)
    const expectedConfidence = (0.95 * 0.3 + 0.90 * 0.25) / (0.3 + 0.25);
    expect(finalDetection.confidence).toBeCloseTo(expectedConfidence);

    // Check ensemble details
    expect(finalDetection.ensembleDetails?.providerAgreement).toBe(2);
    expect(finalDetection.ensembleDetails?.labelConsensus).toBe('split');
  });

  it('should keep distinct detections separate', () => {
    const googleDetections: Detection[] = [
      {
        id: 'g1', label: 'Laptop', confidence: 0.95,
        boundingBox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        imageWidth: 1000, imageHeight: 1000,
      },
    ];

    const awsDetections: Detection[] = [
      {
        id: 'a1', label: 'Mug', confidence: 0.88,
        boundingBox: { x: 0.7, y: 0.7, width: 0.1, height: 0.1 }, // Non-overlapping box
        imageWidth: 1000, imageHeight: 1000,
      },
    ];

    const providerDetections = new Map<string, Detection[]>();
    providerDetections.set('google', googleDetections);
    providerDetections.set('aws', awsDetections);

    const fused = fusionService.fuseDetections(providerDetections);

    // Expect two separate detections
    expect(fused).toHaveLength(2);
  });

  it('should filter detections below the ensemble confidence threshold', () => {
    const googleDetections: Detection[] = [
      {
        id: 'g1', label: 'Chair', confidence: 0.3, // Below default 0.35 threshold
        boundingBox: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
        imageWidth: 1000, imageHeight: 1000,
      },
    ];

    const providerDetections = new Map<string, Detection[]>();
    providerDetections.set('google', googleDetections);

    const fused = fusionService.fuseDetections(providerDetections);

    // Expect it to be filtered out
    expect(fused).toHaveLength(0);
  });
});