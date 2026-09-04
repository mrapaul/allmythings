import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';

export interface PreparedImage {
  uri: string;
  width: number;
  height: number;
  /** Present only when requested via prepareJpegBase64. */
  base64?: string;
}

/**
 * EXIF-safe downscale to a JPEG of the given width. Decodes through
 * expo-image's loader (which applies EXIF orientation) and renders from its
 * native ref — the legacy `manipulateAsync(uri)` path drops orientation on
 * camera-roll JPEGs and bakes them in rotated (see app/detection.tsx).
 * Fails open to the original uri so callers never dead-end.
 */
export async function prepareJpeg(sourceUri: string, targetWidth: number): Promise<PreparedImage> {
  try {
    return await render(sourceUri, targetWidth, false);
  } catch {
    return { uri: sourceUri, width: 0, height: 0 };
  }
}

/**
 * Same downscale, but also returns the JPEG bytes as base64 for in-JS pixel
 * analysis (services/image-quality.ts). Returns null on any failure so
 * callers can treat quality as "no opinion" rather than dead-ending.
 */
export async function prepareJpegBase64(
  sourceUri: string,
  targetWidth: number,
): Promise<PreparedImage | null> {
  try {
    return await render(sourceUri, targetWidth, true);
  } catch {
    return null;
  }
}

async function render(
  sourceUri: string,
  targetWidth: number,
  withBase64: boolean,
): Promise<PreparedImage> {
  const source = await Image.loadAsync(sourceUri);
  try {
    const rendered = await ImageManipulator.ImageManipulator.manipulate(source)
      .resize({ width: targetWidth })
      .renderAsync();
    const saved = await rendered.saveAsync({
      compress: 0.7,
      format: ImageManipulator.SaveFormat.JPEG,
      ...(withBase64 ? { base64: true } : {}),
    });
    rendered.release();
    return {
      uri: saved.uri,
      width: saved.width ?? 0,
      height: saved.height ?? 0,
      ...(saved.base64 ? { base64: saved.base64 } : {}),
    };
  } finally {
    source.release();
  }
}
