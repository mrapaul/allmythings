import type { FlashMode } from 'expo-camera';

/** Flash cycles the way every phone camera does: off → auto → on → off. */
export const FLASH_ORDER: FlashMode[] = ['off', 'auto', 'on'];

export function nextFlashMode(mode: FlashMode): FlashMode {
  const i = FLASH_ORDER.indexOf(mode);
  return FLASH_ORDER[(i + 1) % FLASH_ORDER.length] ?? 'off';
}

export const FLASH_LABEL: Record<FlashMode, string> = { off: 'Off', auto: 'Auto', on: 'On' };

/**
 * Human label for a native lens id. iOS names lenses ("Back Ultra Wide
 * Camera"); Android exposes opaque ids ("0", "2"). Unknown names fall back to
 * an ordinal so the chip never shows raw ids.
 */
export function lensLabel(name: string, index: number): string {
  const n = name.toLowerCase();
  if (n.includes('ultra')) return '0.5×';
  if (n.includes('tele')) return '2×';
  if (n.includes('wide') || n.includes('back') || n.includes('front')) return '1×';
  return `Lens ${index + 1}`;
}

/** Quick zoom chip: 1× ↔ 2× (expo-camera's zoom is a 0..1 fraction of max). */
export const ZOOM_STEP = 0.5;

export function toggleZoom(zoom: number): number {
  return zoom > 0 ? 0 : ZOOM_STEP;
}

export function zoomLabel(zoom: number): string {
  return zoom > 0 ? '2×' : '1×';
}

/** Pinch scale → clamped 0..1 zoom, relative to where the pinch started. */
export function pinchToZoom(startZoom: number, scale: number): number {
  const next = startZoom + (scale - 1) * 0.5;
  return Math.max(0, Math.min(1, next));
}
