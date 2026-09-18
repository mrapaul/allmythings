import sharp from 'sharp';
import { ProposerClient, type ProposerItem } from '../clients/proposer.client';
import type { DetectedItem } from '../types/detected-item';
import {
  collectDetection,
  type DetectionResult,
  type Detector,
  type DetectorEvent,
} from './vlm-detector';
import { DEFAULT_SCENE } from './vlm-detector.parse';

/**
 * Stage A closed-vocab proposer detector (PROPOSER_ENABLED=true).
 *
 * Instead of the two-pass free-form VLM, the frame goes to a dedicated
 * proposer sidecar (see proposer.client.ts for the wire contract) that
 * returns items already restricted to the closed vocabulary, with boxes
 * normalized to [0,1]. Implements the same Detector interface, so the detect
 * routes, async run store, and SSE stream work unchanged.
 *
 * Mapping notes:
 *  - The frame is transcoded to JPEG (EXIF-rotated, fit-inside maxImageSize)
 *    because the routes accept jpeg/png/webp but the proposer contract is
 *    one raw JPEG per request.
 *  - The proposer assesses no scene: the stream yields DEFAULT_SCENE so
 *    downstream consumers keep their shape.
 *  - Proposer items carry no description/tags/confidence; the DetectedItem
 *    contract is filled with description "" and tags [].
 *  - Junk entries (missing label, non-numeric or degenerate box) are skipped,
 *    never fatal — one bad row must not sink the frame.
 */

export class ProposerDetector implements Detector {
  constructor(
    private readonly client: ProposerClient,
    private readonly maxImageSize = 1024,
  ) {}

  async detect(imageBuffer: Buffer): Promise<DetectionResult> {
    return collectDetection(this.detectStream(imageBuffer));
  }

  async *detectStream(imageBuffer: Buffer): AsyncGenerator<DetectorEvent> {
    const jpeg = await sharp(imageBuffer)
      .rotate() // honor EXIF orientation
      .resize(this.maxImageSize, this.maxImageSize, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    const items = await this.client.detect(jpeg);
    yield { kind: 'scene', scene: { ...DEFAULT_SCENE } };
    for (const raw of items) {
      const item = toDetectedItem(raw);
      if (item) yield { kind: 'item', item };
    }
  }
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function toDetectedItem(raw: ProposerItem): DetectedItem | null {
  if (raw === null || typeof raw !== 'object') return null;
  const label = typeof raw.label === 'string' ? raw.label.trim() : '';
  if (!label) return null;
  const box = raw.box;
  const x = num(box?.x);
  const y = num(box?.y);
  const width = num(box?.width);
  const height = num(box?.height);
  // Degenerate or non-numeric boxes are dropped, mirroring the VLM path.
  if (x === null || y === null || width === null || height === null) return null;
  if (width <= 0 || height <= 0) return null;
  return {
    label,
    description: '',
    category: typeof raw.category === 'string' ? raw.category : '',
    tags: [],
    box: { x, y, width, height },
  };
}
