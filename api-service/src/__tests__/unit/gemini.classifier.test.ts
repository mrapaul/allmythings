import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiClassifier } from '../../providers/gemini.classifier';
import { BoundingBoxResult } from '../../providers/detector.interface';

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: vi.fn(),
    }),
  })),
}));

import { GoogleGenerativeAI } from '@google/generative-ai';

const config = {
  geminiApiKey: 'test-key',
  geminiModel: 'gemini-2.5-pro',
  classificationTimeoutMs: 15000,
  classificationMinConfidence: 0.5,
} as any;

const sampleDetections: BoundingBoxResult[] = [
  { box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, coarseLabel: 'furniture', confidence: 0.85 },
];

const sampleVlmResponse = JSON.stringify([
  {
    box_index: 0, label: 'IKEA BILLY bookcase', category: 'living room furniture',
    brand: 'IKEA', model: 'BILLY', colors: ['birch'], materials: ['particleboard'],
    condition: 'good', estimated_value_usd: { low: 40, high: 70 },
    description: 'Bookcase with shelves', confidence: 0.92,
  },
]);

describe('GeminiClassifier', () => {
  let classifier: GeminiClassifier;
  let mockModel: any;

  beforeEach(() => {
    vi.clearAllMocks();
    classifier = new GeminiClassifier(config);
    const ai = (GoogleGenerativeAI as any).mock.results[0]?.value;
    mockModel = ai.getGenerativeModel();
  });

  it('should map snake_case VLM response to camelCase ClassifiedObject', async () => {
    mockModel.generateContent.mockResolvedValueOnce({
      response: { text: () => sampleVlmResponse },
    });

    const results = await classifier.classify(Buffer.from('img'), sampleDetections);
    expect(results).toHaveLength(1);
    expect(results[0].boxIndex).toBe(0);
    expect(results[0].label).toBe('IKEA BILLY bookcase');
    expect(results[0].estimatedValue).toEqual({ low: 40, high: 70 });
    expect(results[0].boundingBox).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
  });

  it('should filter out confidence:0 items', async () => {
    const withZero = JSON.stringify([
      { box_index: 0, label: 'unknown', category: 'unknown', confidence: 0 },
    ]);
    mockModel.generateContent.mockResolvedValueOnce({
      response: { text: () => withZero },
    });
    const results = await classifier.classify(Buffer.from('img'), sampleDetections);
    expect(results).toHaveLength(0);
  });

  it('should use full-image prompt when detections is empty', async () => {
    mockModel.generateContent.mockResolvedValueOnce({
      response: { text: () => sampleVlmResponse },
    });
    await classifier.classify(Buffer.from('img'), []);
    const callArgs = mockModel.generateContent.mock.calls[0][0];
    const promptText = typeof callArgs === 'string' ? callArgs : JSON.stringify(callArgs);
    expect(promptText).toContain('identify all household objects');
  });

  it('should handle markdown-wrapped JSON', async () => {
    const wrapped = '```json\n' + sampleVlmResponse + '\n```';
    mockModel.generateContent.mockResolvedValueOnce({
      response: { text: () => wrapped },
    });
    const results = await classifier.classify(Buffer.from('img'), sampleDetections);
    expect(results).toHaveLength(1);
  });
});
