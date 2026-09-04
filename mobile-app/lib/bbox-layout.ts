import type { BoundingBox } from '@/types/inventory';

/**
 * Pure math for mapping a normalized (0..1) bounding box onto an image
 * rendered with `contentFit="cover"` inside a fixed container. Mirrors the
 * layout `expo-image` produces: the photo is scaled to fill the container
 * and centered, with overflow clipped by the frame.
 */

export interface CoverLayout {
  renderWidth: number;
  renderHeight: number;
  offsetX: number;
  offsetY: number;
}

export interface ViewRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Boxes covering (almost) the entire photo carry no localization signal —
 * treat them as "no detection" so UI indicators stay meaningful.
 */
const FULL_FRAME_AREA_THRESHOLD = 0.98;

export function computeCoverLayout(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
): CoverLayout {
  if (containerWidth <= 0 || containerHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return {
      renderWidth: Math.max(0, containerWidth),
      renderHeight: Math.max(0, containerHeight),
      offsetX: 0,
      offsetY: 0,
    };
  }
  const scale = Math.max(containerWidth / imageWidth, containerHeight / imageHeight);
  const renderWidth = imageWidth * scale;
  const renderHeight = imageHeight * scale;
  return {
    renderWidth,
    renderHeight,
    offsetX: (containerWidth - renderWidth) / 2,
    offsetY: (containerHeight - renderHeight) / 2,
  };
}

export function boxToViewRect(box: BoundingBox, layout: CoverLayout): ViewRect {
  return {
    left: layout.offsetX + box.x * layout.renderWidth,
    top: layout.offsetY + box.y * layout.renderHeight,
    width: box.width * layout.renderWidth,
    height: box.height * layout.renderHeight,
  };
}

export function isDetectedBox(box: BoundingBox | null | undefined): boolean {
  if (!box) return false;
  if (box.width <= 0 || box.height <= 0) return false;
  return box.width * box.height < FULL_FRAME_AREA_THRESHOLD;
}

/** Default context padding around a detected box when zooming onto it. */
export const BBOX_ZOOM_PADDING = 0.18;

/** Guards against a zero-area padded region producing an infinite scale. */
const MIN_REGION_EXTENT = 1e-6;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampCoverOffset(offset: number, container: number, render: number): number {
  return Math.min(0, Math.max(container - render, offset));
}

/**
 * Layout that zooms the source photo so the item's detected region (plus
 * `paddingPct` context on every side, clamped to the image bounds) fills the
 * container. The image always covers the container fully — offsets are
 * clamped so no edge gap ever shows. Falls back to a plain cover fit when
 * the box carries no localization signal.
 */
export function bboxZoomLayout(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
  box: BoundingBox,
  paddingPct: number = BBOX_ZOOM_PADDING,
): CoverLayout {
  const hasValidInputs =
    containerWidth > 0 && containerHeight > 0 && imageWidth > 0 && imageHeight > 0;
  if (!hasValidInputs || !isDetectedBox(box)) {
    return computeCoverLayout(containerWidth, containerHeight, imageWidth, imageHeight);
  }

  const left = clamp01(box.x - box.width * paddingPct);
  const top = clamp01(box.y - box.height * paddingPct);
  const right = clamp01(box.x + box.width * (1 + paddingPct));
  const bottom = clamp01(box.y + box.height * (1 + paddingPct));
  const regionWidth = Math.max(right - left, MIN_REGION_EXTENT);
  const regionHeight = Math.max(bottom - top, MIN_REGION_EXTENT);

  const scale = Math.max(
    containerWidth / (regionWidth * imageWidth),
    containerHeight / (regionHeight * imageHeight),
  );
  const renderWidth = imageWidth * scale;
  const renderHeight = imageHeight * scale;

  const centeredX = (containerWidth - regionWidth * renderWidth) / 2 - left * renderWidth;
  const centeredY = (containerHeight - regionHeight * renderHeight) / 2 - top * renderHeight;

  return {
    renderWidth,
    renderHeight,
    offsetX: clampCoverOffset(centeredX, containerWidth, renderWidth),
    offsetY: clampCoverOffset(centeredY, containerHeight, renderHeight),
  };
}
