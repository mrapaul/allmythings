import { describe, it, expect, beforeEach } from 'vitest';
import { createDetector } from '../../../services/vlm-detector.factory';

describe('vlm-detector.factory', () => {
  describe('createDetector', () => {
    beforeEach(() => {
      delete (process.env as any).DETECTOR;
      delete (process.env as any).OLLAMA_BASE_URL;
      delete (process.env as any).OLLAMA_MODEL;
      delete (process.env as any).CONFIDENCE_THRESHOLD;
      delete (process.env as any).QWEN_VISION_ENDPOINT;
      delete (process.env as any).QWEN_VISION_API_KEY;
      delete (process.env as any).GD_ENDPOINT;
      delete (process.env as any).GD_PROMPT;
      delete (process.env as any).GD_BOX_THRESHOLD;
      delete (process.env as any).GD_TEXT_THRESHOLD;
    });

    it('returns VlmDetector when DETECTOR=vlm', () => {
      process.env.DETECTOR = 'vlm';
      process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
      
      const detector = createDetector();
      
      expect(detector).toBeDefined();
    });

    it('returns QwenVisionAdapter when DETECTOR=qwen (default)', () => {
      process.env.QWEN_VISION_ENDPOINT = 'http://qwen.test:8000/v1/chat/completions';
      process.env.QWEN_VISION_API_KEY = 'test-key-123';
      
      const detector = createDetector();
      
      expect(detector).toBeDefined();
    });

    it('returns GroundingDinoAdapter when DETECTOR=grounding-dino', () => {
      process.env.DETECTOR = 'grounding-dino';
      process.env.GD_ENDPOINT = 'http://localhost:14002/detect';
      process.env.GD_PROMPT = 'home objects . furniture . decor';
      
      const detector = createDetector();
      
      expect(detector).toBeDefined();
    });

    it('returns TieredDetector when DETECTOR=tiered', () => {
      process.env.DETECTOR = 'tiered';
      process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
      process.env.GD_ENDPOINT = 'http://localhost:14002/detect';
      process.env.GD_PROMPT = 'home objects';
      
      const detector = createDetector();
      
      expect(detector).toBeDefined();
    });
  });
});
