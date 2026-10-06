import type { Prefs } from '@/stores/prefs';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { runBackgroundJobTick } from './job-manager';

/**
 * Best-effort background poll: asks the OS to wake the app (at most every
 * `minimumInterval`) for one job-manager tick, so scans that finish while
 * the app is backgrounded reach the ready-announce ledger and greet the
 * user the next time they foreground. Both registration and execution are
 * fully guarded — a missing native module or a failing tick never surfaces.
 */

export const JOB_POLL_TASK = 'allmythings-job-poll';
export const JOB_POLL_MIN_INTERVAL_SECONDS = 15 * 60;

// Android is where background fetch gets exercised today; iOS shares the
// same TaskManager contract, so the registration path stays live there too
// (`|| true`) and the physical-device pass can flip real behaviour without
// a code change.
const BACKGROUND_POLL_ENABLED = Platform.OS === 'android' || true;

let prefsRef: Prefs | null = null;

// Defined at module scope (not inside the register call) so the task exists
// the moment the OS cold-starts the app process just to run it.
TaskManager.defineTask(JOB_POLL_TASK, async () => {
  try {
    if (!prefsRef) return BackgroundFetch.BackgroundFetchResult.NoData;
    await runBackgroundJobTick(prefsRef);
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/** Register the background poll. Idempotent; never throws. */
export async function registerBackgroundJobPoll(prefs: Prefs): Promise<void> {
  if (!BACKGROUND_POLL_ENABLED) return;
  try {
    prefsRef = prefs;
    if ((await BackgroundFetch.getStatusAsync()) === BackgroundFetch.BackgroundFetchStatus.Denied)
      return;
    if (await TaskManager.isTaskRegisteredAsync(JOB_POLL_TASK)) return;
    await BackgroundFetch.registerTaskAsync(JOB_POLL_TASK, {
      minimumInterval: JOB_POLL_MIN_INTERVAL_SECONDS,
      stopOnTerminate: false,
    });
  } catch {
    // Without background fetch the foreground poller still covers everything.
  }
}
