/**
 * Camera level math for the viewfinder bubble. Pure functions only — the
 * hook samples gravity and the component renders; the thresholds live here
 * so they can be unit-tested and tuned in one place.
 */

/** Half-angle of the green window: |roll| and |pitch| both under this read as level. */
export const LEVEL_TOLERANCE_RAD = (2.5 * Math.PI) / 180;
/** Tilt that pushes the bubble to the rim of its track (bubble travel range). */
export const LEVEL_BUBBLE_RANGE_RAD = (15 * Math.PI) / 180;

export interface RollPitch {
  /** Signed in-plane rotation from gravity (radians). */
  roll: number;
  /** Forward/backward tilt from gravity (radians). */
  pitch: number;
}

/**
 * Signed roll/pitch from the accelerometer gravity vector. With the phone
 * held upright to shoot, gravity sits mostly on y; roll shows up as x and
 * forward lean as z. Matches tiltFromGravity's atan2(x, -y) so the bubble
 * and the 'tilted' coach hint never disagree about which way is up.
 */
export function rollPitchFromGravity(x: number, y: number, z: number): RollPitch {
  return {
    roll: Math.atan2(x, -y),
    pitch: Math.atan2(z, Math.sqrt(x * x + y * y)),
  };
}

/** True when both tilts are inside the tolerance window. */
export function isLevel(roll: number, pitch: number, tolerance = LEVEL_TOLERANCE_RAD): boolean {
  return Math.abs(roll) < tolerance && Math.abs(pitch) < tolerance;
}

/** Bubble displacement within its circular track, clamped to the rim. */
export function bubbleOffset(
  roll: number,
  pitch: number,
  maxOffset: number,
  range = LEVEL_BUBBLE_RANGE_RAD,
): { dx: number; dy: number } {
  const clamp = (v: number): number => Math.max(-1, Math.min(1, v / range));
  return { dx: clamp(roll) * maxOffset, dy: clamp(pitch) * maxOffset };
}
