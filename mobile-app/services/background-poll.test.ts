import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The background-fetch task: defined at module scope under the agreed task
 * name, registered with a 15-minute floor, idempotent, and never throwing —
 * registration failures are ignored and a failing tick resolves Failed.
 */

const bg = vi.hoisted(() => ({
  registerTaskAsync: vi.fn().mockResolvedValue(undefined),
  getStatusAsync: vi.fn(),
}));
vi.mock('expo-background-fetch', () => ({
  ...bg,
  unregisterTaskAsync: vi.fn().mockResolvedValue(undefined),
  BackgroundFetchStatus: { Denied: 1, Restricted: 2, Available: 3 },
  BackgroundFetchResult: { NoData: 1, NewData: 2, Failed: 3 },
}));

const tasks = vi.hoisted(() => ({
  defineTask: vi.fn(),
  isTaskRegisteredAsync: vi.fn(),
}));
vi.mock('expo-task-manager', () => ({
  ...tasks,
  isTaskDefined: () => true,
  unregisterTaskAsync: vi.fn().mockResolvedValue(undefined),
}));

const tick = vi.hoisted(() => ({ runBackgroundJobTick: vi.fn() }));
vi.mock('@/services/job-manager', () => ({ runBackgroundJobTick: tick.runBackgroundJobTick }));

const { Prefs } = await import('@/stores/prefs');

type TaskExecutor = () => Promise<number>;

// Fresh module per test: module scope holds prefsRef and runs defineTask.
const importPoll = async () => {
  vi.resetModules();
  const mod = await import('./background-poll');
  return {
    mod,
    executor: tasks.defineTask.mock.calls.at(-1)?.[1] as TaskExecutor,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  bg.registerTaskAsync.mockResolvedValue(undefined);
  bg.getStatusAsync.mockResolvedValue(3); // BackgroundFetchStatus.Available
  tasks.isTaskRegisteredAsync.mockResolvedValue(false);
  tick.runBackgroundJobTick.mockResolvedValue(undefined);
});

describe('background job poll', () => {
  it('defines the task at module scope under the agreed name', async () => {
    const { mod, executor } = await importPoll();
    expect(mod.JOB_POLL_TASK).toBe('allmythings-job-poll');
    expect(tasks.defineTask).toHaveBeenCalledWith('allmythings-job-poll', executor);
  });

  it('registers with a 15-minute minimum interval', async () => {
    const { mod } = await importPoll();
    const prefs = Prefs.makeInMemory();
    await mod.registerBackgroundJobPoll(prefs);

    expect(bg.registerTaskAsync).toHaveBeenCalledWith('allmythings-job-poll', {
      minimumInterval: 15 * 60,
      stopOnTerminate: false,
    });
  });

  it('does not register twice', async () => {
    const { mod } = await importPoll();
    tasks.isTaskRegisteredAsync.mockResolvedValue(true);
    await mod.registerBackgroundJobPoll(Prefs.makeInMemory());
    expect(bg.registerTaskAsync).not.toHaveBeenCalled();
  });

  it('does not register when the OS denies background refresh', async () => {
    const { mod } = await importPoll();
    bg.getStatusAsync.mockResolvedValue(1); // BackgroundFetchStatus.Denied
    await mod.registerBackgroundJobPoll(Prefs.makeInMemory());
    expect(bg.registerTaskAsync).not.toHaveBeenCalled();
  });

  it('never throws when registration fails', async () => {
    const { mod } = await importPoll();
    bg.getStatusAsync.mockRejectedValue(new Error('native module missing'));
    await expect(mod.registerBackgroundJobPoll(Prefs.makeInMemory())).resolves.toBeUndefined();
    expect(bg.registerTaskAsync).not.toHaveBeenCalled();
  });

  it('runs one job-manager tick and reports NewData', async () => {
    const { mod, executor } = await importPoll();
    const prefs = Prefs.makeInMemory();
    await mod.registerBackgroundJobPoll(prefs);

    await expect(executor()).resolves.toBe(2); // BackgroundFetchResult.NewData
    expect(tick.runBackgroundJobTick).toHaveBeenCalledWith(prefs);
  });

  it('reports NoData when the task runs before registration', async () => {
    const { executor } = await importPoll();
    await expect(executor()).resolves.toBe(1); // BackgroundFetchResult.NoData
    expect(tick.runBackgroundJobTick).not.toHaveBeenCalled();
  });

  it('reports Failed instead of throwing when the tick fails', async () => {
    const { mod, executor } = await importPoll();
    await mod.registerBackgroundJobPoll(Prefs.makeInMemory());
    tick.runBackgroundJobTick.mockRejectedValue(new Error('boom'));

    await expect(executor()).resolves.toBe(3); // BackgroundFetchResult.Failed
  });
});
