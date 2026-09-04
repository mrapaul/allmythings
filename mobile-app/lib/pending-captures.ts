/**
 * Pending-capture queue helpers (never-lose-a-capture). When detection can't
 * start (server unreachable / 5xx), the photo is queued here and retried
 * later instead of surfacing a raw error. Pure functions — persistence lives
 * in `stores/prefs.ts`.
 */

export interface PendingCapture {
  id: string;
  imageUri: string;
  createdAt: number;
  attempts: number;
}

export function isPendingCapture(value: unknown): value is PendingCapture {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.imageUri === 'string' &&
    typeof v.createdAt === 'number' &&
    typeof v.attempts === 'number'
  );
}

/**
 * Adds a capture to the queue, or bumps the attempt count when the same
 * photo already failed before. Never mutates the input list.
 */
export function upsertPendingCapture(
  list: PendingCapture[],
  imageUri: string,
  now: number = Date.now(),
): PendingCapture[] {
  const exists = list.some((c) => c.imageUri === imageUri);
  if (exists) {
    return list.map((c) => (c.imageUri === imageUri ? { ...c, attempts: c.attempts + 1 } : c));
  }
  return [...list, { id: `capture_${now}_${list.length}`, imageUri, createdAt: now, attempts: 0 }];
}

export function removePendingCapture(list: PendingCapture[], imageUri: string): PendingCapture[] {
  return list.filter((c) => c.imageUri !== imageUri);
}
