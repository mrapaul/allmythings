import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Local "scans ready" notifications: permission dance (best-effort, ask
 * once), the banner payload (copy + inbox deep link), and the MMKV-backed
 * announce-once ledger that makes a batch of ready jobs notify exactly one
 * time across foregrounds.
 */

const notif = vi.hoisted(() => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  scheduleNotificationAsync: vi.fn(),
  setNotificationHandler: vi.fn(),
}));

vi.mock('expo-notifications', () => ({
  ...notif,
  addNotificationResponseReceivedListener: () => ({ remove: () => undefined }),
}));

const granted = { granted: true, canAskAgain: true, status: 'granted' };
const undetermined = { granted: false, canAskAgain: true, status: 'undetermined' };
const deniedFinal = { granted: false, canAskAgain: false, status: 'denied' };

const { Prefs } = await import('@/stores/prefs');

// `permissionRequested` is module state; resetModules + dynamic import gives
// each test a fresh module (and therefore a fresh ask-once flag).
let notifications: typeof import('./notifications');
let prefs: ReturnType<typeof Prefs.makeInMemory>;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  notif.getPermissionsAsync.mockResolvedValue(granted);
  notif.requestPermissionsAsync.mockResolvedValue(granted);
  notif.scheduleNotificationAsync.mockResolvedValue('notif-id');
  notifications = await import('./notifications');
  prefs = Prefs.makeInMemory();
});

describe('ensurePermissions', () => {
  it('returns true when permission is already granted, without asking', async () => {
    expect(await notifications.ensurePermissions()).toBe(true);
    expect(notif.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('asks once and returns the request result', async () => {
    notif.getPermissionsAsync.mockResolvedValue(undetermined);
    expect(await notifications.ensurePermissions()).toBe(true);
    expect(notif.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    // Second call: never re-asks even though the request path is exhausted.
    notif.requestPermissionsAsync.mockResolvedValue({ ...granted, granted: false });
    expect(await notifications.ensurePermissions()).toBe(false);
    expect(notif.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('does not ask again when the OS says canAskAgain is false', async () => {
    notif.getPermissionsAsync.mockResolvedValue(deniedFinal);
    expect(await notifications.ensurePermissions()).toBe(false);
    expect(notif.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('resolves false instead of throwing on a permission-check failure', async () => {
    notif.getPermissionsAsync.mockRejectedValue(new Error('native module missing'));
    expect(await notifications.ensurePermissions()).toBe(false);
  });
});

describe('scheduleReadyNotification', () => {
  it('builds the "N scans are ready to review" banner with the inbox deep link', async () => {
    const id = await notifications.scheduleReadyNotification(3);
    expect(id).toBe('notif-id');
    expect(notif.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: 'Your scans are ready',
        body: '3 scans are ready to review',
        categoryIdentifier: 'scans-ready',
        data: { url: '/inbox' },
      },
      trigger: null,
    });
  });

  it('singularises the copy for one scan', async () => {
    await notifications.scheduleReadyNotification(1);
    const scheduled = notif.scheduleNotificationAsync.mock.calls[0]?.[0];
    expect(scheduled?.content?.body).toBe('1 scan is ready to review');
  });

  it('skips the banner entirely for an empty batch', async () => {
    expect(await notifications.scheduleReadyNotification(0)).toBeNull();
    expect(notif.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('returns null without scheduling when permission is denied', async () => {
    notif.getPermissionsAsync.mockResolvedValue(deniedFinal);
    expect(await notifications.scheduleReadyNotification(2)).toBeNull();
    expect(notif.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('returns null instead of throwing when scheduling fails', async () => {
    notif.scheduleNotificationAsync.mockRejectedValue(new Error('no scheduler'));
    expect(await notifications.scheduleReadyNotification(2)).toBeNull();
  });
});

describe('ready-announce ledger', () => {
  const kv = () => prefs.getKvBackend();

  it('announces the same batch only once', async () => {
    const { noteReadyScansBackgrounded, pendingReadyScans, markReadyScansAnnounced } =
      notifications;
    noteReadyScansBackgrounded(kv(), ['r-1', 'r-2']);
    expect(pendingReadyScans(kv(), ['r-1', 'r-2'])).toEqual(['r-1', 'r-2']);

    markReadyScansAnnounced(kv(), ['r-1', 'r-2']);
    expect(pendingReadyScans(kv(), ['r-1', 'r-2'])).toEqual([]);

    // A later background tick re-observing the same ready jobs must not
    // re-queue them for another banner.
    noteReadyScansBackgrounded(kv(), ['r-1', 'r-2']);
    expect(pendingReadyScans(kv(), ['r-1', 'r-2'])).toEqual([]);
  });

  it('intersects pending with live ready jobs only', () => {
    notifications.noteReadyScansBackgrounded(kv(), ['r-1', 'r-2', 'r-gone']);
    expect(notifications.pendingReadyScans(kv(), ['r-2'])).toEqual(['r-2']);
  });

  it('prunes ledger entries whose jobs no longer exist', () => {
    const { noteReadyScansBackgrounded, markReadyScansAnnounced, pruneReadyScansLedger } =
      notifications;
    noteReadyScansBackgrounded(kv(), ['r-1', 'r-2']);
    markReadyScansAnnounced(kv(), ['r-3']);
    pruneReadyScansLedger(kv(), ['r-1']);
    // r-2 dropped from pending, r-3 dropped from announced; r-1 (still live)
    // stays pending.
    expect(notifications.pendingReadyScans(kv(), ['r-1', 'r-2', 'r-3'])).toEqual(['r-1']);
  });

  it('announceReadyScans schedules once for the batch and marks it announced', async () => {
    const schedule = vi.fn().mockResolvedValue('id');
    const vibrate = vi.fn();
    notifications.noteReadyScansBackgrounded(kv(), ['r-1', 'r-2']);
    await notifications.announceReadyScans(kv(), ['r-1', 'r-2'], { schedule, vibrate });

    expect(schedule).toHaveBeenCalledWith(2);
    expect(vibrate).toHaveBeenCalledTimes(1);
    // Announced: a second announce over the same batch has nothing to say.
    await notifications.announceReadyScans(kv(), [], { schedule, vibrate });
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it('announceReadyScans keeps the batch pending when scheduling fails', async () => {
    const schedule = vi.fn().mockResolvedValue(null);
    notifications.noteReadyScansBackgrounded(kv(), ['r-1']);
    await notifications.announceReadyScans(kv(), ['r-1'], { schedule });

    expect(notifications.pendingReadyScans(kv(), ['r-1'])).toEqual(['r-1']);
    // The retry on the next foreground succeeds and closes the batch.
    schedule.mockResolvedValue('id');
    await notifications.announceReadyScans(kv(), ['r-1'], { schedule });
    expect(notifications.pendingReadyScans(kv(), ['r-1'])).toEqual([]);
  });
});

describe('deepLinkFromNotificationData', () => {
  it('accepts a string url and rejects everything else', () => {
    expect(notifications.deepLinkFromNotificationData({ url: '/inbox' })).toBe('/inbox');
    expect(notifications.deepLinkFromNotificationData({ url: 42 })).toBeNull();
    expect(notifications.deepLinkFromNotificationData({})).toBeNull();
    expect(notifications.deepLinkFromNotificationData(undefined)).toBeNull();
  });
});

describe('configureNotificationHandler', () => {
  it('installs a quiet-banner handler', async () => {
    notifications.configureNotificationHandler();
    const handler = notif.setNotificationHandler.mock.calls[0]?.[0]?.handleNotification;
    expect(handler).toBeDefined();
    await expect(handler?.()).resolves.toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
  });
});
