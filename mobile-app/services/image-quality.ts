import { type GrayscaleSample, type QualityReport, analyzeQuality } from '@/lib/image-quality';
import { prepareJpegBase64 } from './image-prep';

/**
 * Decode path for the on-device quality check.
 *
 * The stack has no raw-pixel API (no GL/Skia, and expo-image exposes none),
 * so the cheapest reliable route is: downscale with expo-image-manipulator to
 * a tiny JPEG with `base64: true`, then decode those few KB in JS with
 * jpeg-js (pure JS, zero deps, `useTArray` so no Buffer polyfill is needed).
 * At this size the decode is sub-millisecond-ish and needs no native module —
 * hence no rebuild.
 */

/**
 * Analysis width. Blur detection needs some high-frequency detail to measure,
 * so this is larger than a thumbnail but still tiny (~128×96 ≈ 12k pixels).
 */
export const ANALYSIS_WIDTH = 128;

/** ITU-R BT.601 luma — matches how brightness is perceived. */
function toLuma(rgba: ArrayLike<number>, pixelCount: number): Uint8Array {
  const luma = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    luma[i] =
      (0.299 * Number(rgba[o]) + 0.587 * Number(rgba[o + 1]) + 0.114 * Number(rgba[o + 2])) | 0;
  }
  return luma;
}

/** Minimal base64 → bytes; avoids depending on a global atob/Buffer. */
export function base64ToBytes(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const byteLength = (clean.length * 3) >> 2;
  const out = new Uint8Array(byteLength);
  let buffer = 0;
  let bits = 0;
  let written = 0;
  for (let i = 0; i < clean.length; i++) {
    const value = chars.indexOf(clean[i] as string);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      if (written < byteLength) out[written++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}

interface JpegDecoder {
  decode(
    data: Uint8Array,
    opts: { useTArray: boolean; formatAsRGBA: boolean },
  ): { width: number; height: number; data: ArrayLike<number> };
}

/** Decodes a tiny JPEG into a grayscale sample grid. */
export function decodeToGrayscale(bytes: Uint8Array): GrayscaleSample | null {
  try {
    // biome-ignore lint/correctness/noNodejsModules: pure-JS module, required lazily so tests need no image fixtures
    // biome-ignore lint/suspicious/noExplicitAny: CJS interop for jpeg-js
    const jpeg = (require as any)('jpeg-js') as JpegDecoder;
    // useTArray keeps output as Uint8Array — React Native has no global Buffer.
    const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
    if (!decoded.width || !decoded.height) return null;
    return {
      width: decoded.width,
      height: decoded.height,
      luma: toLuma(decoded.data, decoded.width * decoded.height),
    };
  } catch {
    return null;
  }
}

/**
 * Runs the on-device quality check for a capture. Returns null when the frame
 * could not be sampled or decoded — callers treat that as "no opinion" and
 * proceed, exactly like the server precheck's fail-open contract.
 */
export async function inspectCaptureQuality(photoUri: string): Promise<QualityReport | null> {
  try {
    const prepared = await prepareJpegBase64(photoUri, ANALYSIS_WIDTH);
    if (!prepared?.base64) return null;
    const sample = decodeToGrayscale(base64ToBytes(prepared.base64));
    return sample ? analyzeQuality(sample) : null;
  } catch {
    return null;
  }
}
