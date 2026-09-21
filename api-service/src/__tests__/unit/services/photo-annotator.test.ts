import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import type { DetectedItem } from '../../../types/detected-item';
import { logger } from '../../../utils/logger';
import {
  ANNOTATED_SUFFIX,
  annotatePhotoFireAndForget,
  annotatePhotoImage,
  annotatedPhotoPath,
  buildAnnotationSvg,
  escapeXml,
  writeAnnotatedPhoto,
} from '../../../services/photo-annotator';

function item(label: string, box: Partial<DetectedItem['box']> = {}): DetectedItem {
  return {
    label,
    description: '',
    category: 'Furniture',
    tags: [],
    box: { x: 0.1, y: 0.2, width: 0.3, height: 0.25, ...box },
  };
}

async function makeJpeg(width = 640, height = 480): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 60, b: 80 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe('photo-annotator', () => {
  describe('escapeXml', () => {
    it('escapes the XML metacharacters', () => {
      expect(escapeXml(`sofa <bed> & "chairs" 'x'`)).toBe(
        'sofa &lt;bed&gt; &amp; &quot;chairs&quot; &apos;x&apos;',
      );
    });
  });

  describe('buildAnnotationSvg', () => {
    it('draws one rectangle per item box mapped to pixel coordinates', () => {
      const svg = buildAnnotationSvg(1000, 500, [
        item('sofa', { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }),
        item('lamp', { x: 0.5, y: 0.5, width: 0.1, height: 0.1 }),
      ]);
      expect(svg).toContain('width="1000" height="500"');
      // 2 boxes + 2 label chips = 4 rects.
      expect(svg.match(/<rect /g)).toHaveLength(4);
      expect(svg).toContain('x="100.0" y="100.0" width="300.0" height="200.0"');
      expect(svg).toContain('x="500.0" y="250.0" width="100.0" height="50.0"');
    });

    it('renders no boxes or labels for an empty item list', () => {
      const svg = buildAnnotationSvg(640, 480, []);
      expect(svg).not.toContain('<rect');
      expect(svg).not.toContain('<text');
    });

    it('skips degenerate and non-finite boxes', () => {
      const svg = buildAnnotationSvg(640, 480, [
        item('zero', { width: 0 }),
        item('negative', { height: -0.5 }),
        item('nan', { x: Number.NaN }),
        item('ok', { x: 0.4, y: 0.4, width: 0.1, height: 0.1 }),
      ]);
      // Only the valid item: one box + one chip.
      expect(svg.match(/<rect /g)).toHaveLength(2);
      expect(svg).not.toContain('zero');
      expect(svg).not.toContain('negative');
      expect(svg).not.toContain('nan');
      expect(svg).toContain('ok');
    });

    it('clamps boxes that overrun the image edge', () => {
      const svg = buildAnnotationSvg(1000, 1000, [
        item('edge', { x: 0.9, y: 0.9, width: 0.5, height: 0.5 }),
      ]);
      expect(svg).toContain('x="900.0" y="900.0" width="100.0" height="100.0"');
    });

    it('XML-escapes label text so markup cannot break the overlay', () => {
      const svg = buildAnnotationSvg(640, 480, [item('sofa <bed> & "chairs"')]);
      expect(svg).toContain('sofa &lt;bed&gt; &amp; &quot;chairs&quot;');
      expect(svg).not.toContain('<bed>');
    });

    it('drops label chip whitespace and bounds very long labels', () => {
      const long = 'a'.repeat(100);
      const svg = buildAnnotationSvg(640, 480, [item(`multi\nline\t${long}`)]);
      expect(svg).not.toContain('\nline');
      expect(svg.match(/<text [^>]*>multi line a+…<\/text>/)).not.toBeNull();
    });

    it('places the chip inside the box top when there is no headroom', () => {
      const svg = buildAnnotationSvg(1000, 1000, [item('top', { x: 0.0, y: 0.0, width: 0.4, height: 0.2 })]);
      // First rect is the box itself (y=0); the chip is dropped inside it.
      const rects = [...svg.matchAll(/<rect x="0\.0" y="([\d.]+)"/g)].map((m) => Number(m[1]));
      expect(rects.length).toBe(2);
      expect(rects[1]).toBeGreaterThan(rects[0]);
    });
  });

  describe('annotatePhotoImage', () => {
    it('returns a JPEG with the source dimensions and boxes burned in', async () => {
      const jpeg = await makeJpeg(640, 480);
      const out = await annotatePhotoImage(jpeg, [
        item('sofa', { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }),
      ]);
      expect(out[0]).toBe(0xff);
      expect(out[1]).toBe(0xd8);
      const meta = await sharp(out).metadata();
      expect(meta.format).toBe('jpeg');
      expect(meta.width).toBe(640);
      expect(meta.height).toBe(480);
    });
  });

  describe('writeAnnotatedPhoto / annotatedPhotoPath', () => {
    it('writes <sha>.annotated.jpg into the photos dir', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'annotator-'));
      try {
        const jpeg = await makeJpeg(320, 240);
        const file = await writeAnnotatedPhoto(dir, 'abc123', jpeg, [item('sofa')]);
        expect(file).toBe(annotatedPhotoPath(dir, 'abc123'));
        expect(file.endsWith(ANNOTATED_SUFFIX)).toBe(true);
        const written = fs.readFileSync(file);
        expect(written[0]).toBe(0xff);
        expect(written[1]).toBe(0xd8);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('annotatePhotoFireAndForget', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    });

    it('logs a warning and never throws when rendering fails', async () => {
      // Not a real image: sharp fails inside the fire-and-forget chain.
      expect(() =>
        annotatePhotoFireAndForget('/nonexistent-dir', 'deadbeef', Buffer.from([1, 2, 3]), [
          item('sofa'),
        ]),
      ).not.toThrow();
      await vi.waitFor(() => expect(warnSpy).toHaveBeenCalled(), { timeout: 5000 });
      expect(warnSpy.mock.calls[0]?.[1]).toBe('photo_annotation_failed');
    });
  });
});
