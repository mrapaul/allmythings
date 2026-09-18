import { describe, expect, it } from 'vitest';
import { resolveLocalCoordMode } from '../../../services/vlm-detector.factory';

/**
 * The pass prompts MANDATE a 0-1000 integer box scale. Value inference alone
 * systematically misclassifies compliant output as pixels on production-sized
 * images (pixelCeiling > 1000), shrinking every box ~2.3%. These tests pin the
 * by-model resolution that fixes the bias for known models.
 */
describe('resolveLocalCoordMode', () => {
  it('pins qwen3 (prompt-compliant 0-1000) to thousand', () => {
    expect(resolveLocalCoordMode('qwen3-vl:30b-a3b-instruct', 'auto')).toBe('thousand');
    expect(resolveLocalCoordMode('Qwen3-VL:8B', 'auto')).toBe('thousand');
  });

  it('pins the legacy pixel-mode qwen2.5vl family to pixel', () => {
    expect(resolveLocalCoordMode('qwen2.5vl:7b', 'auto')).toBe('pixel');
    expect(resolveLocalCoordMode('qwen2-vl:7b', 'auto')).toBe('pixel');
  });

  it('falls back to value inference for unknown models', () => {
    expect(resolveLocalCoordMode('gemma4:31b-cloud', 'auto')).toBe('auto');
    expect(resolveLocalCoordMode('some-random-vlm:1b', 'auto')).toBe('auto');
  });

  it('an explicit VLM_COORD_MODE always wins over the pin', () => {
    expect(resolveLocalCoordMode('qwen3-vl:30b', 'pixel')).toBe('pixel');
    expect(resolveLocalCoordMode('qwen2.5vl:7b', 'thousand')).toBe('thousand');
    expect(resolveLocalCoordMode('gemma4:31b-cloud', 'norm')).toBe('norm');
  });
});
