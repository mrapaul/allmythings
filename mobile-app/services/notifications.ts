import type { KVBackend } from '@/stores/prefs';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import type { Href } from 'expo-router';

/**
 * Local "your scans are ready" notifications. The server is LAN-private so
 * there is no push: the job manager records ready transitions that happen
 * while the app is backgrounded, and this module announces them (exactly
 * once) the next time the app foregrounds — one local notification for the
 * whole batch, deep-opening the review inbox on tap.
 */

/** Route opened when the user taps a ready-scans notification. */
export const READY_SCANS_DEEP_LINK: Href = '/inbox';

/** Category groups these banners for a future notification-settings screen. */
export const READY_SCANS_CATEGORY = 'scans-ready';

const KEY_PENDING = 'ready_scans_pending';
const KEY_ANNOUNCED = 'ready_scans_announced';

/**
 * Present ready-scan notifications as quiet banners: no sound, no badge
 * counting. Called once from the root layout.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

let permissionRequested = false;

/**
 * Best-effort: resolves true when notification permission is granted, asking
 * the OS at most once per app run. Any failure resolves false — callers skip
 * the banner instead of pestering the user.
 */
export async function ensurePermissions(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain || permissionRequested) return false;
    permissionRequested = true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

/**
 * Schedule one local notification for a batch of ready scans; resolves the
 * scheduled id, or null when permission is missing or scheduling failed.
 */
export async function scheduleReadyNotification(count: number): Promise<string | null> {
  if (count <= 0) return null;
  if (!(await ensurePermissions())) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Your scans are ready',
        body: count === 1 ? '1 scan is ready to review' : `${count} scans are ready to review`,
        categoryIdentifier: READY_SCANS_CATEGORY,
        data: { url: READY_SCANS_DEEP_LINK },
      },
      trigger: null,
    });
  } catch {
    return null;
  }
}

// ── Ready-announce ledger ──────────────────────────────────────────────
//
// A transition observed while the app is backgrounded can't show anything
// (the banner would land on a hidden app), so the runIds are remembered in
// MMKV; the next foreground schedules one notification for the whole batch
// and marks every runId announced. The announced set is what guarantees the
// same batch never notifies twice, no matter how often the app foregrounds.

function readRunIds(kv: KVBackend, key: string): Set<string> {
  const raw = kv.getString(key);
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    return new Set(
      Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [],
    );
  } catch {
    return new Set();
  }
}

function writeRunIds(kv: KVBackend, key: string, ids: ReadonlySet<string>): void {
  if (ids.size === 0) kv.delete(key);
  else kv.set(key, JSON.stringify([...ids]));
}

/** Remember ready runIds observed while backgrounded (already-announced stay quiet). */
export function noteReadyScansBackgrounded(kv: KVBackend, runIds: readonly string[]): void {
  if (runIds.length === 0) return;
  const announced = readRunIds(kv, KEY_ANNOUNCED);
  const pending = readRunIds(kv, KEY_PENDING);
  for (const id of runIds) {
    if (!announced.has(id)) pending.add(id);
  }
  writeRunIds(kv, KEY_PENDING, pending);
}

/** Pending runIds that are still live ready jobs, in the caller's order. */
export function pendingReadyScans(kv: KVBackend, liveReadyRunIds: readonly string[]): string[] {
  const pending = readRunIds(kv, KEY_PENDING);
  return liveReadyRunIds.filter((id) => pending.has(id));
}

/** Mark a batch announced (banner scheduled, or haptic given while active). */
export function markReadyScansAnnounced(kv: KVBackend, runIds: readonly string[]): void {
  if (runIds.length === 0) return;
  const announced = readRunIds(kv, KEY_ANNOUNCED);
  const pending = readRunIds(kv, KEY_PENDING);
  for (const id of runIds) {
    announced.add(id);
    pending.delete(id);
  }
  writeRunIds(kv, KEY_ANNOUNCED, announced);
  writeRunIds(kv, KEY_PENDING, pending);
}

// ── Foreground toast sink ────────────────────────────────────────────
//
// A pending batch announced while the app is in the foreground never
// reaches for the OS banner (it would land on an app the user is already
// looking at, and be missed): the home screen registers its in-app toast
// here and the job manager publishes the count on announcement. Same
// announce-once ledger, same single call for the whole batch.

export type ReadyScansAnnounceListener = (count: number) => void;

let readyScansAnnounceListener: ReadyScansAnnounceListener | null = null;

/** Register (or clear, with null) the foreground toast sink. */
export function setReadyScansAnnounceListener(fn: ReadyScansAnnounceListener | null): void {
  readyScansAnnounceListener = fn;
}

/** Publish an announced batch count to the foreground toast, if one listens. */
export function notifyReadyScansAnnounced(count: number): void {
  readyScansAnnounceListener?.(count);
}

/** Drop ledger entries whose jobs no longer exist (retention prune, removal). */
export function pruneReadyScansLedger(kv: KVBackend, liveRunIds: readonly string[]): void {
  const live = new Set(liveRunIds);
  const pending = readRunIds(kv, KEY_PENDING);
  const announced = readRunIds(kv, KEY_ANNOUNCED);
  writeRunIds(kv, KEY_PENDING, new Set([...pending].filter((id) => live.has(id))));
  writeRunIds(kv, KEY_ANNOUNCED, new Set([...announced].filter((id) => live.has(id))));
}

/** Deep link carried in notification data, or null when absent/invalid. */
export function deepLinkFromNotificationData(
  data: Record<string, unknown> | null | undefined,
): Href | null {
  const url = data?.url;
  return typeof url === 'string' ? (url as Href) : null;
}

/** Soft success haptic for freshly ready scans. */
export function hapticReadyScans(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/**
 * Fire-and-forget announce: one notification for the whole batch plus a
 * haptic, then mark announced. A scheduling failure leaves the batch pending
 * so the next foreground retries instead of silently losing the announcement.
 */
export async function announceReadyScans(
  kv: KVBackend,
  runIds: readonly string[],
  deps: { schedule?: (count: number) => Promise<string | null>; vibrate?: () => void } = {},
): Promise<void> {
  if (runIds.length === 0) return;
  const id = await (deps.schedule ?? scheduleReadyNotification)(runIds.length).catch(() => null);
  if (id == null) return;
  (deps.vibrate ?? hapticReadyScans)();
  markReadyScansAnnounced(kv, runIds);
}
