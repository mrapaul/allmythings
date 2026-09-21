import { describe, expect, it } from 'vitest';
import {
  LEVEL_BUBBLE_RANGE_RAD,
  LEVEL_TOLERANCE_RAD,
  bubbleOffset,
  isLevel,
  rollPitchFromGravity,
} from './level';

const DEG = Math.PI / 180;

describe('rollPitchFromGravity', () => {
  it('reads zero roll and pitch when gravity points straight down the y axis', () => {
    const { roll, pitch } = rollPitchFromGravity(0, -1, 0);
    expect(roll).toBeCloseTo(0, 6);
    expect(pitch).toBeCloseTo(0, 6);
  });

  it('reads +90° roll when gravity sits fully on +x', () => {
    expect(rollPitchFromGravity(1, 0, 0).roll).toBeCloseTo(Math.PI / 2, 6);
  });

  it('reads positive pitch when gravity leans into +z', () => {
    const { pitch } = rollPitchFromGravity(0, -Math.SQRT1_2, Math.SQRT1_2);
    expect(pitch).toBeCloseTo(Math.PI / 4, 6);
  });
});

describe('isLevel', () => {
  it('is true at rest', () => {
    expect(isLevel(0, 0)).toBe(true);
  });

  it('is true just inside the tolerance and false just outside', () => {
    expect(isLevel(LEVEL_TOLERANCE_RAD - 0.001, 0)).toBe(true);
    expect(isLevel(LEVEL_TOLERANCE_RAD + 0.001, 0)).toBe(false);
    expect(isLevel(0, -(LEVEL_TOLERANCE_RAD - 0.001))).toBe(true);
    expect(isLevel(0, LEVEL_TOLERANCE_RAD + 0.001)).toBe(false);
  });

  it('needs BOTH axes inside — a large tilt on either fails even when the other is perfect', () => {
    expect(isLevel(0, 20 * DEG)).toBe(false);
    expect(isLevel(20 * DEG, 0)).toBe(false);
  });
});

describe('bubbleOffset', () => {
  it('sits at the center when level', () => {
    expect(bubbleOffset(0, 0, 12)).toEqual({ dx: 0, dy: 0 });
  });

  it('scales linearly with angle and clamps at the rim', () => {
    const half = bubbleOffset(LEVEL_BUBBLE_RANGE_RAD / 2, 0, 12);
    expect(half.dx).toBeCloseTo(6, 6);
    const rim = bubbleOffset(LEVEL_BUBBLE_RANGE_RAD * 3, 0, 12);
    expect(rim.dx).toBe(12);
    const negativeRim = bubbleOffset(0, -LEVEL_BUBBLE_RANGE_RAD * 3, 12);
    expect(negativeRim.dy).toBe(-12);
  });
});
