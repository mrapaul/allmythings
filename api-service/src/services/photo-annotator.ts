import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { DetectedItem } from '../types/detected-item';
import { logger } from '../utils/logger';

/**
 * Annotated-photo burn-in for the enhanced camera mode.
 *
 * After a successful VLM detection the API renders
 * `<photoDir>/photos/<photoSha256>.annotated.jpg`: the persisted frame with
 * every returned DetectedItem's normalized box drawn as a semi-transparent
 * rectangle and its label on a high-contrast chip above the box (an SVG
 * overlay composited with sharp). The mobile app derives the URL as
 * `${base}/photos/<photoSha256>.jpg?annotated=1` — photoSha256 is already in
 * the async status response and the SSE meta event, so no response schema
 * changes. Everything here is best-effort: rendering runs fire-and-forget
 * after the response, and a failure is logged, never thrown — the client
 * falls back to the raw photo (the annotated route 404s until rendered).
 */

export const ANNOTATED_SUFFIX = '.annotated.jpg';

const BOX_COLOR = '#00e5ff';
const BOX_FILL_OPACITY = 0.16;
const BOX_STROKE_OPACITY = 0.9;
const CHIP_FILL = 'rgba(15, 23, 42, 0.82)';
const TEXT_FILL = '#ffffff';
const FONT_FAMILY = 'Arial, Helvetica, sans-serif';
const MAX_LABEL_CHARS = 48;

/** Escape text for interpolation into an SVG/XML document. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Flatten control whitespace and bound label length for the chip. */
function cleanLabel(raw: string): string {
  const flat = raw.replace(/[\r\n\t]+/g, ' ').trim();
  return flat.length > MAX_LABEL_CHARS ? `${flat.slice(0, MAX_LABEL_CHARS - 1)}…` : flat;
}

interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Map a normalized item box onto pixel coordinates, clamped to the image.
 * Degenerate or non-finite boxes return null and are skipped, mirroring the
 * detector's own drop policy.
 */
function toPixelBox(
  box: DetectedItem['box'] | undefined,
  width: number,
  height: number,
): PixelBox | null {
  if (!box) return null;
  const { x, y, width: w, height: h } = box;
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  const cx = Math.min(Math.max(x, 0), 1);
  const cy = Math.min(Math.max(y, 0), 1);
  return {
    x: cx * width,
    y: cy * height,
    width: Math.min(w, 1 - cx) * width,
    height: Math.min(h, 1 - cy) * height,
  };
}

/**
 * Build the overlay SVG at the image's own pixel size: one semi-transparent
 * rectangle per item box, label chip above the box (inside the top edge when
 * there is no headroom).
 */
export function buildAnnotationSvg(width: number, height: number, items: DetectedItem[]): string {
  const fontSize = Math.max(12, Math.round(Math.min(width, height) * 0.03));
  const strokeWidth = Math.max(2, Math.round(Math.min(width, height) * 0.004));
  const padX = Math.round(fontSize * 0.45);
  const padY = Math.round(fontSize * 0.25);
  const chipHeight = fontSize + padY * 2;

  const parts: string[] = [];
  for (const item of items) {
    const box = toPixelBox(item?.box, width, height);
    if (!box) continue;
    parts.push(
      `<rect x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}" width="${box.width.toFixed(
        1,
      )}" height="${box.height.toFixed(1)}" fill="${BOX_COLOR}" fill-opacity="${BOX_FILL_OPACITY}" stroke="${BOX_COLOR}" stroke-opacity="${BOX_STROKE_OPACITY}" stroke-width="${strokeWidth}"/>`,
    );
    const label = typeof item?.label === 'string' ? cleanLabel(item.label) : '';
    if (!label) continue;
    const textWidth = Math.ceil(label.length * fontSize * 0.6);
    const chipWidth = textWidth + padX * 2;
    const chipX = Math.min(box.x, Math.max(0, width - chipWidth));
    let chipY = box.y - chipHeight - 2;
    if (chipY < 0) chipY = box.y + 2;
    parts.push(
      `<rect x="${chipX.toFixed(1)}" y="${chipY.toFixed(1)}" width="${chipWidth}" height="${chipHeight}" rx="${Math.round(
        fontSize * 0.3,
      )}" fill="${CHIP_FILL}"/>`,
    );
    parts.push(
      `<text x="${(chipX + padX).toFixed(1)}" y="${(chipY + padY + fontSize).toFixed(
        1,
      )}" font-family="${FONT_FAMILY}" font-size="${fontSize}" fill="${TEXT_FILL}">${escapeXml(
        label,
      )}</text>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`;
}

/**
 * Render the annotated JPEG: EXIF-orient the frame (boxes are normalized
 * against the rotated image the model saw), composite the SVG overlay, and
 * re-encode as JPEG. Pure-ish: buffer + items -> jpeg buffer.
 */
export async function annotatePhotoImage(
  imageBuffer: Buffer,
  items: DetectedItem[],
): Promise<Buffer> {
  const { data, info } = await sharp(imageBuffer)
    .rotate() // honor EXIF orientation before mapping normalized boxes
    .jpeg()
    .toBuffer({ resolveWithObject: true });
  const svg = buildAnnotationSvg(info.width, info.height, items);
  return sharp(data)
    .composite([{ input: Buffer.from(svg, 'utf-8'), top: 0, left: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();
}

/** Absolute path of the annotated render for one persisted photo. */
export function annotatedPhotoPath(photosDir: string, photoSha256: string): string {
  return path.join(photosDir, `${photoSha256}${ANNOTATED_SUFFIX}`);
}

/** Render and persist the annotated copy; returns the file path. */
export async function writeAnnotatedPhoto(
  photosDir: string,
  photoSha256: string,
  imageBuffer: Buffer,
  items: DetectedItem[],
): Promise<string> {
  const jpeg = await annotatePhotoImage(imageBuffer, items);
  await fs.mkdir(photosDir, { recursive: true });
  const file = annotatedPhotoPath(photosDir, photoSha256);
  await fs.writeFile(file, jpeg);
  return file;
}

/**
 * Fire-and-forget variant for the detect routes: kicks off after the
 * response/stream has been sent, never blocks, and logs a warning on failure
 * (the annotated route then 404s and the client falls back to the raw photo).
 */
export function annotatePhotoFireAndForget(
  photosDir: string,
  photoSha256: string,
  imageBuffer: Buffer,
  items: DetectedItem[],
): void {
  void writeAnnotatedPhoto(photosDir, photoSha256, imageBuffer, items).then(
    (file) =>
      logger.info(
        { photoSha256, path: file, items: items.length },
        'photo_annotated',
      ),
    (err: unknown) =>
      logger.warn(
        { photoSha256, err: err instanceof Error ? err.message : String(err) },
        'photo_annotation_failed',
      ),
  );
}
