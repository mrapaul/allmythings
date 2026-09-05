import { describe, expect, it } from 'vitest';
import {
  dHash,
  hammingDistance,
  initialOverlapState,
  pushLiveFrame,
  rememberShot,
} from './frame-fingerprint';
import type { GrayscaleSample } from './image-quality';

/** A synthetic "shelf": a smooth texture; `seed` picks a different texture. */
function gradient(width: number, height: number, seed = 0): GrayscaleSample {
  const luma = new Uint8Array(width * height);
  const fx = 6 + seed * 3;
  const fy = 9 - seed * 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = seed === 0 ? Math.sin(x / fx + y / fy) : Math.cos(y / fx - x / fy + seed);
      luma[y * width + x] = Math.round(127 + 120 * v);
    }
  }
  return { width, height, luma };
}

function noisy(sample: GrayscaleSample, amplitude: number): GrayscaleSample {
  const luma = new Uint8Array(sample.luma.length);
  for (let i = 0; i < luma.length; i++) {
    const n = ((i * 7919) % 13) - 6;
    luma[i] = Math.max(0, Math.min(255, (sample.luma[i] ?? 0) + (n * amplitude) / 6));
  }
  return { ...sample, luma };
}

describe('dHash', () => {
  it('is stable under brightness offset and mild noise, and far for a different scene', () => {
    const a = gradient(128, 96);
    const brighter = {
      ...a,
      data: new Uint8Array(a.luma as Uint8Array).map((v) => Math.min(255, v + 30)),
    };
    const other = gradient(128, 96, 1);
    expect(hammingDistance(dHash(a), dHash(brighter))).toBeLessThanOrEqual(2);
    expect(hammingDistance(dHash(a), dHash(noisy(a, 8)))).toBeLessThanOrEqual(6);
    expect(hammingDistance(dHash(a), dHash(other))).toBeGreaterThan(18);
  });
});

describe('overlap memory', () => {
  const shelfA = dHash(gradient(128, 96));
  const shelfB = dHash(gradient(128, 96, 1));

  it('never flags before any shot, and not while still pointing at the shot just taken', () => {
    const s0 = initialOverlapState();
    expect(pushLiveFrame(s0, shelfA).overlap).toBe(false);
    const s1 = rememberShot(s0, shelfA);
    expect(pushLiveFrame(s1, shelfA).overlap).toBe(false);
  });

  it('flags a return to a shot area only after the viewfinder moved away', () => {
    let s = rememberShot(initialOverlapState(), shelfA);
    const away = pushLiveFrame(s, shelfB);
    expect(away.overlap).toBe(false);
    s = away.state;
    expect(pushLiveFrame(s, shelfA).overlap).toBe(true);
  });

  it('a new shot resets the away gate', () => {
    let s = rememberShot(initialOverlapState(), shelfA);
    s = pushLiveFrame(s, shelfB).state;
    s = rememberShot(s, shelfB);
    expect(pushLiveFrame(s, shelfB).overlap).toBe(false);
  });
});
