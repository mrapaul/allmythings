import type { BoundingBox } from '@/types/inventory';
import { isDetectedBox } from './bbox-layout';

/** Context padding around the detected box, as a fraction of the box size. */
export const THUMB_PADDING_FRACTION = 0.15;
/** Longest edge of the generated thumbnail file. */
export const THUMB_TARGET_PX = 600;

export interface CropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/**
 * Pixel crop rect for an item thumbnail: the normalized detection box plus
 * ~15% context padding, clamped to the source image. Returns null when the
 * box carries no localization signal (full-frame/manual items keep the whole
 * photo) or when the source dimensions are unusable.
 */
export function thumbCropRect(
  box: BoundingBox,
  imageWidth: number,
  imageHeight: number,
  padFraction: number = THUMB_PADDING_FRACTION,
): CropRect | null {
  if (imageWidth <= 0 || imageHeight <= 0) return null;
  if (!isDetectedBox(box)) return null;

  const padX = box.width * padFraction;
  const padY = box.height * padFraction;
  const left = Math.max(0, box.x - padX);
  const top = Math.max(0, box.y - padY);
  const right = Math.min(1, box.x + box.width + padX);
  const bottom = Math.min(1, box.y + box.height + padY);

  const originX = Math.round(left * imageWidth);
  const originY = Math.round(top * imageHeight);
  const width = Math.round((right - left) * imageWidth);
  const height = Math.round((bottom - top) * imageHeight);
  if (width < 8 || height < 8) return null;

  return {
    originX: Math.min(originX, imageWidth - width),
    originY: Math.min(originY, imageHeight - height),
    width,
    height,
  };
}

/** Resize width for the cropped region, capped so small crops never upscale. */
export function thumbResizeWidth(cropWidth: number, targetPx: number = THUMB_TARGET_PX): number {
  return Math.min(cropWidth, targetPx);
}
