import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Ready-scan announcements: a running→ready transition observed while the
 * app is active is haptic-only (the inbox updates under the user's nose), a
 * transition observed while backgrounded is remembered and announced once on
 * the next foreground — and the same batch never notifies twice.
 */

const dispatchShotMock = vi.hoisted(() => vi.fn());
vi.mock('@/services/walk-capture', () => ({ dispatchShot: dispatchShotMock }));

const haptics = vi.hoisted(() => ({ notificationAsync: vi.fn().mockResolvedValue(undefined) }));
vi.mock('expo-haptics', () => ({
  ...haptics,
  impactAsync: vi.fn().mockResolvedValue(undefined),
  selectionAsync: vi.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

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

import { AppState } from 'react-native';

const { Prefs } = await import('@/stores/prefs');
const { getJobsStore, initJobsStore, addJob, markJobReviewed } = await import(
  '@/stores/jobs.store'
);
const { startJobPolling, runBackgroundJobTick } = await import('./job-manager');

const flush = () => new Promise((r) => setTimeout(r, 0));
const flushAll = async () => {
  for (let i = 0; i < 6; i++) await flush();
};

// The RN stub's AppState is a plain object; take the wheel so tests can
// drive background/foreground transitions and capture the change listener.
type AppStateStub = {
  currentState: string;
  addEventListener: (type: string, cb: (state: string) => void) => { remove: () => void };
};
const appState = AppState as unknown as AppStateStub;
let changeListeners: Array<(state: string) => void> = [];
const originalAddEventListener = appState.addEventListener;

function runningJob(runId: string) {
  return {
    runId,
    photoUri: `file:///${runId}.jpg`,
    startedAt: Date.now(),
    roomSessionId: 'session-1',
    status: 'running' as const,
    itemCount: 0,
    errorCode: null,
    reviewed: false,
    advice: null,
  };
}

const completedFor = (runIds: string[]) =>
  vi
    .fn()
    .mockImplementation((runId: string) =>
      runIds.includes(runId)
        ? Promise.resolve({ status: 'completed', workflowId: runId, result: { items: [{}] } })
        : Promise.resolve({ status: 'running', workflowId: runId }),
    );

describe('job manager — ready-scan announcements', () => {
  let prefs: ReturnType<typeof Prefs.makeInMemory>;

  beforeEach(() => {
    vi.clearAllMocks();
    notif.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    notif.scheduleNotificationAsync.mockResolvedValue('notif-id');
    prefs = Prefs.makeInMemory();
    initJobsStore(prefs);
    changeListeners = [];
    appState.addEventListener = (_type, cb) => {
      changeListeners.push(cb);
      return { remove: () => undefined };
    };
    appState.currentState = 'active';
  });

  afterEach(() => {
    appState.addEventListener = originalAddEventListener;
    appState.currentState = 'active';
  });

  const goForeground = async () => {
    appState.currentState = 'active';
    for (const cb of changeListeners) cb('active');
    await flushAll();
  };

  it('haptics without a banner when the transition happens while active', async () => {
    addJob(runningJob('r-active'));
    const stop = startJobPolling(prefs, {
      getStatus: completedFor(['r-active']),
      intervalMs: 60_000,
    });
    await flushAll();
    stop();

    expect(
      getJobsStore()
        .getState()
        .jobs.find((j) => j.runId === 'r-active')?.status,
    ).toBe('ready');
    expect(haptics.notificationAsync).toHaveBeenCalledWith('success');
    expect(notif.scheduleNotificationAsync).not.toHaveBeenCalled();
    // Marked announced: a later foreground has nothing pending.
    await goForeground();
    expect(notif.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('remembers backgrounded transitions and announces them once on foreground', async () => {
    addJob(runningJob('r-bg'));
    const stop = startJobPolling(prefs, { getStatus: completedFor(['r-bg']), intervalMs: 60_000 });
    // App backgrounds before the server finishes; the background-fetch tick
    // is what observes the running→ready transition.
    appState.currentState = 'background';
    await runBackgroundJobTick(prefs, { getStatus: completedFor(['r-bg']) });

    expect(
      getJobsStore()
        .getState()
        .jobs.find((j) => j.runId === 'r-bg')?.status,
    ).toBe('ready');
    expect(haptics.notificationAsync).not.toHaveBeenCalled();
    expect(notif.scheduleNotificationAsync).not.toHaveBeenCalled();

    await goForeground();
    expect(notif.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(notif.scheduleNotificationAsync.mock.calls[0]?.[0].content.body).toBe(
      '1 scan is ready to review',
    );
    expect(haptics.notificationAsync).toHaveBeenCalledWith('success');

    // The announce-once guard: another foreground must not re-notify.
    await goForeground();
    expect(notif.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    stop();
  });

  it('announces one notification for the whole pending batch', async () => {
    addJob(runningJob('r-a'));
    addJob(runningJob('r-b'));
    const stop = startJobPolling(prefs, {
      getStatus: completedFor(['r-a', 'r-b']),
      intervalMs: 60_000,
    });
    appState.currentState = 'background';
    await runBackgroundJobTick(prefs, { getStatus: completedFor(['r-a', 'r-b']) });
    await goForeground();

    expect(notif.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(notif.scheduleNotificationAsync.mock.calls[0]?.[0].content.body).toBe(
      '2 scans are ready to review',
    );
    stop();
  });

  it('skips the banner when the ready jobs were already reviewed', async () => {
    addJob(runningJob('r-seen'));
    const stop = startJobPolling(prefs, {
      getStatus: completedFor(['r-seen']),
      intervalMs: 60_000,
    });
    appState.currentState = 'background';
    await runBackgroundJobTick(prefs, { getStatus: completedFor(['r-seen']) });
    // Reviewed on another device / before this foreground's announce ran.
    markJobReviewed('r-seen');
    await goForeground();

    expect(notif.scheduleNotificationAsync).not.toHaveBeenCalled();
    stop();
  });

  it('never throws when the background tick hits a failing status fetch', async () => {
    addJob(runningJob('r-sick'));
    const getStatus = vi.fn().mockRejectedValue(new Error('socket hang up'));
    await expect(runBackgroundJobTick(prefs, { getStatus })).resolves.toBeUndefined();
    expect(
      getJobsStore()
        .getState()
        .jobs.find((j) => j.runId === 'r-sick')?.status,
    ).toBe('running');
  });
});
