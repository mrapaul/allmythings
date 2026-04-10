import { describe, it, expect, vi } from 'vitest';
import { ClaudeClassifier } from '../../src/providers/claude.classifier';

describe('ClaudeClassifier', () => {
  const config = {
    claudeApiKey: 'test-key',
    claudeModel: 'claude-sonnet-4-20250514',
    classificationTimeoutMs: 30000,
  } as any;

  it('should have name "claude"', () => {
    const classifier = new ClaudeClassifier(config);
    expect(classifier.name).toBe('claude');
  });

  it('should implement healthCheck', async () => {
    const classifier = new ClaudeClassifier(config);
    const result = await classifier.healthCheck();
    expect(typeof result).toBe('boolean');
  });

  it('should parse VLM response into ClassifiedObject array', () => {
    const classifier = new ClaudeClassifier(config);
    const json = JSON.stringify([
      {
        label: 'wooden dining table',
        category: 'Furniture',
        bounding_box: [100, 200, 500, 800],
        confidence: 0.9,
        colors: ['brown'],
        materials: ['oak wood'],
        condition: 'good',
        estimated_value_usd: 300,
      },
    ]);

    const result = (classifier as any).parseVlmResponse(json);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('wooden dining table');
    expect(result[0].boundingBox.x).toBeCloseTo(0.2);
    expect(result[0].boundingBox.y).toBeCloseTo(0.1);
    expect(result[0].boundingBox.width).toBeCloseTo(0.6);
    expect(result[0].boundingBox.height).toBeCloseTo(0.4);
  });
});
