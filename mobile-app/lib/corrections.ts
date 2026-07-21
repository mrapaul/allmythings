import { apiFetch, makeTraceparent } from '@/api/client';
import type { DetectedItem, PhotoVerdict, SceneInfo } from '@/api/types';
import type { DetectionRow } from '@/stores/detection-screen.store';
import type { Prefs } from '@/stores/prefs';

/**
 * Flywheel client side: turn what the user did on the review screen into
 * correction events, and deliver them with an offline-tolerant queue.
 */

export type CorrectionEvent =
  | { type: 'accept'; item: DetectedItem }
  | { type: 'discard'; item: DetectedItem }
  | { type: 'relabel'; item: DetectedItem; newLabel: string; newTags: string[] }
  | { type: 'add_box'; item: DetectedItem }
  | { type: 'photo_verdict'; verdict: PhotoVerdict; userOverride: boolean };

export interface CorrectionsPayload {
  photoSha256: string;
  model: string;
  capturedAt: string;
  scene: SceneInfo | null;
  events: CorrectionEvent[];
}

/** Failed submissions kept for retry; oldest dropped beyond this. */
export const MAX_QUEUED = 20;

export function buildCorrectionEvents(
  rows: DetectionRow[],
  tagsByRow: Record<string, string[]>,
  scene: SceneInfo | null,
  verdictOverridden: boolean,
): CorrectionEvent[] {
  const events: CorrectionEvent[] = [];
  for (const row of rows) {
    if (!row.included) {
      events.push({ type: 'discard', item: row.item });
      continue;
    }
    const tags = (tagsByRow[row.id] ?? []).filter((t) => t.trim());
    const finalLabel = tags[0] ?? row.item.label;
    if (row.manual) {
      events.push({ type: 'add_box', item: { ...row.item, label: finalLabel } });
      continue;
    }
    if (finalLabel !== row.item.label) {
      events.push({ type: 'relabel', item: row.item, newLabel: finalLabel, newTags: tags });
      continue;
    }
    events.push({ type: 'accept', item: row.item });
  }
  if (scene) {
    events.push({ type: 'photo_verdict', verdict: scene.verdict, userOverride: verdictOverridden });
  }
  return events;
}

export class CorrectionsQueue {
  constructor(private readonly prefs: Prefs) {}

  /** Queue the payload, then try to deliver everything queued. */
  async submit(payload: CorrectionsPayload): Promise<void> {
    const queue = this.prefs.getCorrectionsQueue();
    queue.push(JSON.stringify(payload));
    this.prefs.setCorrectionsQueue(queue.slice(-MAX_QUEUED));
    await this.flush();
  }

  /** Attempt delivery of every queued payload; returns how many remain. */
  async flush(): Promise<number> {
    const queue = this.prefs.getCorrectionsQueue();
    const remaining: string[] = [];
    for (const raw of queue) {
      try {
        await apiFetch('/v1/corrections', {
          method: 'POST',
          body: JSON.parse(raw) as Record<string, unknown>,
          headers: { traceparent: makeTraceparent() },
        });
      } catch {
        remaining.push(raw);
      }
    }
    this.prefs.setCorrectionsQueue(remaining);
    return remaining.length;
  }
}
