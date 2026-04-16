import { describe, it, expect, vi } from 'vitest';
import { FlorencePipelineService, DetectResult } from '../../services/florence-pipeline.service';
import { FlorenceDetector } from '../../providers/florence.detector';
import { OllamaClassifier } from '../../providers/ollama.classifier';
import { PhotoStorageService } from '../../services/photo-storage.service';

vi.mock('../../providers/florence.detector');
vi.mock('../../providers/ollama.classifier');
vi.mock('../../services/photo-storage.service');

describe('FlorencePipelineService', () => {
  it('runs save -> detect -> enrich -> assemble pipeline', async () => {
    const mockStorage = {
      save: vi.fn().mockResolvedValue({
        photoId: 'test-id',
        photoPath: '/tmp/test-id.jpg',
        thumbnailPath: '/tmp/test-id_thumb.jpg',
      }),
    } as unknown as PhotoStorageService;

    const mockDetector = {
      detect: vi.fn().mockResolvedValue([
        { box: { x: 0.1, y: 0.2, width: 0.15, height: 0.25 }, coarseLabel: 'desk lamp', confidence: 1.0 },
      ]),
    } as unknown as FlorenceDetector;

    const mockClassifier = {
      name: 'ollama',
      classify: vi.fn().mockResolvedValue([
        {
          boxIndex: 0,
          label: 'Brass desk lamp',
          category: 'Lighting',
          brand: null,
          model: null,
          colors: ['brass'],
          materials: ['metal'],
          condition: 'good',
          estimatedValue: { low: 40, high: 60 },
          description: 'Modern brass desk lamp',
          confidence: 0.87,
          boundingBox: { x: 0.1, y: 0.2, width: 0.15, height: 0.25 },
        },
      ]),
    } as unknown as OllamaClassifier;

    const pipeline = new FlorencePipelineService(mockStorage, mockDetector, mockClassifier);
    const result: DetectResult = await pipeline.detect(Buffer.from('fake'));

    expect(result.photoId).toBe('test-id');
    expect(result.photoUrl).toBe('/photos/test-id.jpg');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].label).toBe('Brass desk lamp');
    expect(result.items[0].attributes.category).toBe('Lighting');
    expect(result.errors).toEqual([]);
    expect(result.processingMs).toBeGreaterThanOrEqual(0);
    expect(result.traceId).toBeDefined();
  });

  it('returns Florence labels when Qwen enrichment fails', async () => {
    const mockStorage = {
      save: vi.fn().mockResolvedValue({
        photoId: 'id', photoPath: '/p', thumbnailPath: '/t',
      }),
    } as unknown as PhotoStorageService;

    const mockDetector = {
      detect: vi.fn().mockResolvedValue([
        { box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, coarseLabel: 'sofa', confidence: 1.0 },
      ]),
    } as unknown as FlorenceDetector;

    const mockClassifier = {
      name: 'ollama',
      classify: vi.fn().mockRejectedValue(new Error('Ollama timeout')),
    } as unknown as OllamaClassifier;

    const pipeline = new FlorencePipelineService(mockStorage, mockDetector, mockClassifier);
    const result = await pipeline.detect(Buffer.from('fake'));

    expect(result.items).toHaveLength(1);
    expect(result.items[0].label).toBe('sofa');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].step).toBe('qwen-enrich');
  });
});
