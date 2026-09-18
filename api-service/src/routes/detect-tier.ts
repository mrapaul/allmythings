import { BadRequestError } from '../utils/errors';

/**
 * Quality-tier selection for the detect routes, via the `tier` query param:
 * absent or 'standard' = the default local engine; 'quality' = the optional,
 * env-configured quality VLM tier (QUALITY_VLM_URL + QUALITY_VLM_MODEL).
 * Anything else is rejected here — i.e. before any frame is persisted or
 * sent to a detector.
 */
export type DetectTier = 'standard' | 'quality';

export function parseDetectTier(query: unknown): DetectTier {
  const raw = (query as Record<string, unknown> | undefined)?.tier;
  if (raw === undefined || raw === 'standard') return 'standard';
  if (raw === 'quality') return 'quality';
  throw new BadRequestError(`Unsupported tier "${String(raw)}"; expected "standard" or "quality"`);
}

/**
 * Human-readable reason tier=quality cannot be served right now; the routes
 * turn it into their respective 4xx shape.
 */
export function qualityTierUnavailableMessage(): string {
  return 'tier=quality is not available: set QUALITY_VLM_URL and QUALITY_VLM_MODEL (requires DETECTOR=vlm)';
}
