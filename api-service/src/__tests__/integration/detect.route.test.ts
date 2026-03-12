import { describe, it, expect } from 'vitest';
import { sampleBoundingBoxes, sampleClassifiedObjects } from '../fixtures/test-data';

// Stub: verify fixture shapes are correct
describe('detect route fixtures', () => {
  it('sampleBoundingBoxes has correct shape', () => {
    expect(sampleBoundingBoxes).toHaveLength(2);
    expect(sampleBoundingBoxes[0]).toMatchObject({
      box: expect.objectContaining({ x: expect.any(Number) }),
      coarseLabel: expect.any(String),
      confidence: expect.any(Number),
    });
  });

  it('sampleClassifiedObjects has correct shape', () => {
    expect(sampleClassifiedObjects).toHaveLength(2);
    const obj = sampleClassifiedObjects[0];
    expect(obj).toMatchObject({
      boxIndex: expect.any(Number),
      label: expect.any(String),
      category: expect.any(String),
      confidence: expect.any(Number),
      boundingBox: expect.objectContaining({ x: expect.any(Number) }),
    });
  });
});
