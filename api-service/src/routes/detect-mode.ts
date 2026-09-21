import { BadRequestError } from '../utils/errors';

/**
 * Per-request scout mode for the detect routes, via the `mode` query param:
 * absent or 'full' = the default two-pass detection (pass 1 + adaptive tiles
 * + pass-2 audit); 'scout' = single pass — pass 1 and adaptive tiles only,
 * skipping the pass-2 audit. Scout is cheaper and faster but less exhaustive;
 * the app uses it for the enhanced camera's live framing feedback.
 * Anything else is rejected here — i.e. before any frame is persisted or
 * sent to a detector.
 */
export type DetectMode = 'full' | 'scout';

export function parseDetectMode(query: unknown): DetectMode {
  const raw = (query as Record<string, unknown> | undefined)?.mode;
  if (raw === undefined || raw === 'full') return 'full';
  if (raw === 'scout') return 'scout';
  throw new BadRequestError(`Unsupported mode "${String(raw)}"; expected "full" or "scout"`);
}
