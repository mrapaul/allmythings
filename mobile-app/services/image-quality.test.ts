import { analyzeQuality } from '@/lib/image-quality';
import { describe, expect, it } from 'vitest';
import { base64ToBytes, decodeToGrayscale } from './image-quality';

/**
 * Proves the real pixel path — base64 → jpeg-js decode → grayscale grid →
 * verdict — using JPEGs encoded in-test. If jpeg-js ever stops working
 * without a Buffer global (the `useTArray` contract), these fail loudly.
 */

interface Rgba {
  data: Uint8Array;
  width: number;
  height: number;
}

/** Builds an RGBA buffer via a per-pixel callback. */
function rgba(width: number, height: number, fn: (x: number, y: number) => number): Rgba {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = fn(x, y);
      const o = (y * width + x) * 4;
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  return { data, width, height };
}

function encodeJpegBase64(image: Rgba, quality = 90): string {
  // jpeg-js's encoder is only used here, to build fixtures.
  // biome-ignore lint/correctness/noNodejsModules: test-only fixture encoding
  // biome-ignore lint/suspicious/noExplicitAny: CJS interop
  const jpeg = (require as any)('jpeg-js');
  const encoded = jpeg.encode(image, quality);
  return Buffer.from(encoded.data).toString('base64');
}

describe('base64ToBytes', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 128, 64]);
    const base64 = Buffer.from(bytes).toString('base64');
    expect(Array.from(base64ToBytes(base64))).toEqual(Array.from(bytes));
  });

  it('tolerates whitespace and data-URI padding characters', () => {
    const bytes = new Uint8Array([72, 105]);
    const base64 = Buffer.from(bytes).toString('base64');
    expect(Array.from(base64ToBytes(`  ${base64}\n`))).toEqual(Array.from(bytes));
  });
});

describe('decodeToGrayscale', () => {
  it('decodes a JPEG without a Buffer global (useTArray contract)', () => {
    const image = rgba(48, 32, () => 120);
    const sample = decodeToGrayscale(base64ToBytes(encodeJpegBase64(image)));
    expect(sample).not.toBeNull();
    expect(sample?.width).toBe(48);
    expect(sample?.height).toBe(32);
    expect(sample?.luma.length).toBe(48 * 32);
  });

  it('returns null for data that is not a JPEG', () => {
    expect(decodeToGrayscale(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});

describe('end-to-end verdicts from encoded JPEGs', () => {
  it('classifies a genuinely dark photo as too_dark', () => {
    const sample = decodeToGrayscale(base64ToBytes(encodeJpegBase64(rgba(64, 48, () => 12))));
    expect(sample).not.toBeNull();
    expect(analyzeQuality(sample as never).verdict).toBe('too_dark');
  });

  it('classifies a blank mid-grey wall as low_detail', () => {
    const sample = decodeToGrayscale(base64ToBytes(encodeJpegBase64(rgba(64, 48, () => 130))));
    expect(analyzeQuality(sample as never).verdict).toBe('low_detail');
  });

  it('accepts a well-exposed, detailed photo', () => {
    // Fine checkerboard survives JPEG at high quality as real edge energy.
    const detailed = rgba(64, 48, (x, y) => (((x >> 1) + (y >> 1)) % 2 === 0 ? 60 : 200));
    const sample = decodeToGrayscale(base64ToBytes(encodeJpegBase64(detailed, 95)));
    const report = analyzeQuality(sample as never);
    expect(report.verdict).toBe('ok');
    expect(report.focusScore).toBeGreaterThan(0);
  });
});
