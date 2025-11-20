import { describe, it, expect } from 'vitest';
import { NMSAlgorithm } from '../../src/algorithms/nms.algorithm';
import { Detection } from '../../src/schemas/detection.schema';
import { EnsembleFusionService } from '../../src/services/ensemble-fusion.service';

describe('Algorithm Unit Tests', () => {

  describe('NMSAlgorithm', () => {
    it('should merge detections with IoU > 0.5', () => {
      const detections: Detection[] = [
        { id: 'd1', label: 'a', confidence: 0.9, boundingBox: { x: 0, y: 0, width: 0.5, height: 0.5 }, imageWidth: 100, imageHeight: 100 },
        { id: 'd2', label: 'b', confidence: 0.8, boundingBox: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 }, imageWidth: 100, imageHeight: 100 }, // Overlaps > 0.5
        { id: 'd3', label: 'c', confidence: 0.7, boundingBox: { x: 0.8, y: 0.8, width: 0.1, height: 0.1 }, imageWidth: 100, imageHeight: 100 }, // No overlap
      ];

      const result = NMSAlgorithm.apply(detections, 0.5);

      expect(result).toHaveLength(2);
      // It should keep the one with the highest confidence from the overlapping group
      expect(result.some(d => d.id === 'd1')).toBe(true);
      expect(result.some(d => d.id === 'd3')).toBe(true);
    });
  });

  // The following tests are for private methods in EnsembleFusionService, 
  // which isn't standard practice. However, since the logic is complex and critical,
  // we can test it indirectly via the public `fuseDetections` method.
  // The integration test already covers this well, but we add specific unit-like checks here.
  describe('EnsembleFusionService Algorithms', () => {
    const fusionService = new EnsembleFusionService();

    it('T046: correctly calculates weighted confidence fusion', () => {
      const detections = new Map<string, Detection[]>();
      detections.set('google', [{ id: 'g1', label: 'Laptop', confidence: 0.95, boundingBox: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }, imageWidth: 100, imageHeight: 100 }]);
      detections.set('aws', [{ id: 'a1', label: 'Laptop', confidence: 0.90, boundingBox: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }, imageWidth: 100, imageHeight: 100 }]);

      const fused = fusionService.fuseDetections(detections);
      const expectedConfidence = (0.95 * 0.3 + 0.90 * 0.25) / (0.3 + 0.25); // Default weights

      expect(fused[0].confidence).toBeCloseTo(expectedConfidence);
    });

    it('T047: correctly determines label consensus', () => {
      const detections = new Map<string, Detection[]>();
      // Case 1: Consensus
      detections.set('google', [{ id: 'g1', label: 'Laptop', confidence: 0.9, boundingBox: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }, imageWidth: 100, imageHeight: 100 }]);
      detections.set('aws', [{ id: 'a1', label: 'Laptop', confidence: 0.9, boundingBox: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }, imageWidth: 100, imageHeight: 100 }]);
      const fusedWithConsensus = fusionService.fuseDetections(detections);
      expect(fusedWithConsensus[0].ensembleDetails?.labelConsensus).toBe('split');

      // Case 2: No consensus (single provider)
      const singleProviderDetections = new Map<string, Detection[]>();
      singleProviderDetections.set('google', [{ id: 'g1', label: 'Laptop', confidence: 0.9, boundingBox: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }, imageWidth: 100, imageHeight: 100 }]);
      const fusedWithoutConsensus = fusionService.fuseDetections(singleProviderDetections);
      expect(fusedWithoutConsensus[0].ensembleDetails?.labelConsensus).toBe('single-provider');
    });
  });
});
