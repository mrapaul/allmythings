/**
 * On-device pre-upload photo heuristic.
 *
 * A JPEG's compressed size scales with the detail it contains: a sharp, lit
 * scene at quality ~0.7 lands well above this ratio, while a frame that is
 * badly blurred, near-black, or featureless compresses far smaller. This is a
 * cheap advisory check only — the server's model verdict is authoritative.
 */

/** JPEG bytes-per-pixel below which the frame is near-certainly unusable. */
export const MIN_BYTES_PER_PIXEL = 0.035;

export type LocalPhotoAssessment = 'ok' | 'suspect';

export function assessJpeg(bytes: number, width: number, height: number): LocalPhotoAssessment {
  if (bytes <= 0 || width <= 0 || height <= 0) return 'ok';
  return bytes / (width * height) < MIN_BYTES_PER_PIXEL ? 'suspect' : 'ok';
}
