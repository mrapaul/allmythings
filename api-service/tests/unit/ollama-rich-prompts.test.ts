import { describe, it, expect } from 'vitest';
import { OllamaClassifier } from '../../src/providers/ollama.classifier';

const config = {
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'llava:13b',
  classificationTimeoutMs: 30000,
} as any;

const sampleDetection = {
  coarseLabel: 'chair',
  confidence: 0.85,
  box: { x: 0.1, y: 0.1, width: 0.3, height: 0.5 },
};

describe('OllamaClassifier rich attribute prompts', () => {
  describe('buildDetectionPrompt', () => {
    it('includes all rich attribute keys', () => {
      const classifier = new OllamaClassifier(config);
      const prompt = (classifier as any).buildDetectionPrompt([sampleDetection]);
      expect(prompt).toContain('brand');
      expect(prompt).toContain('primary_color');
      expect(prompt).toContain('material');
      expect(prompt).toContain('condition');
      expect(prompt).toContain('estimated_value_low');
      expect(prompt).toContain('estimated_value_high');
    });

    it('lists detected objects in the prompt', () => {
      const classifier = new OllamaClassifier(config);
      const prompt = (classifier as any).buildDetectionPrompt([sampleDetection]);
      expect(prompt).toContain('chair');
    });

    it('specifies valid condition values', () => {
      const classifier = new OllamaClassifier(config);
      const prompt = (classifier as any).buildDetectionPrompt([sampleDetection]);
      expect(prompt).toContain('excellent');
      expect(prompt).toContain('poor');
    });
  });

  describe('buildFullImagePrompt', () => {
    it('includes all rich attribute keys', () => {
      const classifier = new OllamaClassifier(config);
      const prompt = (classifier as any).buildFullImagePrompt();
      expect(prompt).toContain('brand');
      expect(prompt).toContain('primary_color');
      expect(prompt).toContain('material');
      expect(prompt).toContain('condition');
      expect(prompt).toContain('estimated_value_low');
      expect(prompt).toContain('estimated_value_high');
    });
  });

  describe('mapToClassifiedObject', () => {
    it('maps all rich attributes from Ollama response', () => {
      const classifier = new OllamaClassifier(config);
      const detections = [sampleDetection];
      const item = {
        box_index: 0,
        label: 'Eames lounge chair',
        category: 'Furniture',
        brand: 'Herman Miller',
        model: 'Eames Lounge',
        primary_color: 'walnut brown',
        material: 'wood and leather',
        condition: 'excellent',
        estimated_value_low: 4000,
        estimated_value_high: 6000,
        confidence: 0.92,
      };

      const result = (classifier as any).mapToClassifiedObject(item, detections);
      expect(result.brand).toBe('Herman Miller');
      expect(result.model).toBe('Eames Lounge');
      expect(result.colors).toEqual(['walnut brown']);
      expect(result.materials).toEqual(['wood and leather']);
      expect(result.condition).toBe('excellent');
      expect(result.estimatedValue).toEqual({ low: 4000, high: 6000 });
      expect(result.confidence).toBe(0.92);
    });

    it('handles null brand and model gracefully', () => {
      const classifier = new OllamaClassifier(config);
      const detections = [sampleDetection];
      const item = {
        box_index: 0,
        label: 'chair',
        category: 'Furniture',
        brand: null,
        model: null,
        primary_color: 'gray',
        material: 'plastic',
        condition: 'fair',
        estimated_value_low: null,
        estimated_value_high: null,
      };

      const result = (classifier as any).mapToClassifiedObject(item, detections);
      expect(result.brand).toBeNull();
      expect(result.model).toBeNull();
      expect(result.estimatedValue).toBeNull();
    });

    it('handles missing rich fields with safe defaults', () => {
      const classifier = new OllamaClassifier(config);
      const detections = [sampleDetection];
      const item = {
        box_index: 0,
        label: 'bookshelf',
        category: 'Furniture',
      };

      const result = (classifier as any).mapToClassifiedObject(item, detections);
      expect(result.brand).toBeNull();
      expect(result.model).toBeNull();
      expect(result.colors).toEqual([]);
      expect(result.materials).toEqual([]);
      expect(result.condition).toBeNull();
      expect(result.estimatedValue).toBeNull();
    });

    it('constructs estimatedValue as null when only one bound is present', () => {
      const classifier = new OllamaClassifier(config);
      const detections = [sampleDetection];
      const item = {
        box_index: 0,
        label: 'lamp',
        category: 'Lighting',
        estimated_value_low: 50,
        estimated_value_high: null,
      };

      const result = (classifier as any).mapToClassifiedObject(item, detections);
      expect(result.estimatedValue).toBeNull();
    });
  });
});
