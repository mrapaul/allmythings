import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiClassifier } from '../../providers/gemini.classifier';

const mockModel = {
  generateContent: vi.fn(),
};

const mockGenAI = {
  getGenerativeModel: vi.fn().mockReturnValue(mockModel),
};

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => mockGenAI),
}));

const config = {
  geminiApiKey: 'test-key',
  geminiModel: 'gemini-2.5-flash',
} as any;

describe('GeminiClassifier', () => {
  let classifier: GeminiClassifier;

  beforeEach(() => {
    classifier = new GeminiClassifier(config);
    vi.clearAllMocks();
  });

  it('should map snake_case VLM response to camelCase ClassifiedObject', async () => {
    mockModel.generateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify([
          {
            label: 'IKEA BILLY bookcase',
            category: 'Furniture',
            colors: ['white'],
            materials: ['wood'],
            condition: 'good',
            description: 'Against the wall',
            confidence: 0.95,
            bounding_box: [200, 100, 600, 400]
          }
        ]),
      },
    });

    const results = await classifier.classify(Buffer.from('img'), []);
    expect(results).toHaveLength(1);
    expect(results[0].boxIndex).toBe(0);
    expect(results[0].label).toBe('IKEA BILLY bookcase');
    expect(results[0].estimatedValue).toBeNull();
    expect(results[0].boundingBox).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
  });

  it('should use open-vocabulary inventory prompt', async () => {
    mockModel.generateContent.mockResolvedValueOnce({
      response: { text: () => '[]' },
    });

    await classifier.classify(Buffer.from('img'), []);

    const callArgs = mockModel.generateContent.mock.calls[0][0];
    const promptText = typeof callArgs === 'string' ? callArgs : JSON.stringify(callArgs);
    expect(promptText).toContain('Enumerate every visible object');
  });

  it('should map estimated_value_usd to low/high range', async () => {
    mockModel.generateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify([
          {
            label: 'oak dining table',
            category: 'Furniture',
            colors: ['brown'],
            materials: ['oak'],
            condition: 'good',
            confidence: 0.9,
            bounding_box: [0, 0, 500, 500],
            estimated_value_usd: 200,
          }
        ]),
      },
    });

    const results = await classifier.classify(Buffer.from('img'), []);
    expect(results).toHaveLength(1);
    expect(results[0].estimatedValue).toEqual({ low: 140, high: 260 });
  });

  it('should handle markdown-wrapped JSON', async () => {
    mockModel.generateContent.mockResolvedValueOnce({
      response: {
        text: () => '```json\n[{"label": "test", "confidence": 0.9}]\n```',
      },
    });

    const results = await classifier.classify(Buffer.from('img'), []);
    expect(results).toHaveLength(1);
    expect(results[0].label).toBe('test');
  });
});
