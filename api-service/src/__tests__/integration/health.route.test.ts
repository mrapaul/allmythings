import { describe, it, expect } from 'vitest';
import { sampleClassifiedObjects } from '../fixtures/test-data';

// Stub: verify health fixture data
describe('health route fixtures', () => {
  it('sampleClassifiedObjects first item has valid confidence', () => {
    const obj = sampleClassifiedObjects[0];
    expect(obj.confidence).toBeGreaterThan(0);
    expect(obj.confidence).toBeLessThanOrEqual(1);
  });

  it('sampleClassifiedObjects items have estimatedValue', () => {
    for (const obj of sampleClassifiedObjects) {
      if (obj.estimatedValue) {
        expect(obj.estimatedValue.low).toBeLessThanOrEqual(obj.estimatedValue.high);
      }
    }
  });
});
