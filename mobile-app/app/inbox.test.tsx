import { act, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Incident regression: lost runs surface in the inbox as failed cards with
 * calm copy, and retry RE-DISPATCHES the persisted photo — fresh runId, SAME
 * room session — replacing the dead job.
 */

const dispatchSpy = vi.fn(async () => ({ ok: true, runId: 'r-new' }));
const pushSpy = vi.fn();

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: pushSpy, replace: vi.fn(), back: vi.fn() }),
  useLocalSearchParams: () => ({}),
}));

vi.mock('@/services/walk-capture', () => ({ dispatchShot: dispatchSpy }));

const { Prefs } = await import('@/stores/prefs');
const { addJob, getJobsStore, initJobsStore } = await import('@/stores/jobs.store');
const InboxScreen = (await import('./inbox')).default;

function findByTestId(node: unknown, testID: string): { props: Record<string, unknown> } | null {
  if (!node || typeof node !== 'object') return null;
  const n = node as { props?: Record<string, unknown>; children?: unknown[] };
  if (n.props?.testID === testID) return n as { props: Record<string, unknown> };
  for (const child of n.children ?? []) {
    const hit = findByTestId(child, testID);
    if (hit) return hit;
  }
  return null;
}

const LOST_JOB = {
  runId: 'r-dead',
  photoUri: 'file:///walk-shot.jpg',
  startedAt: Date.now(),
  roomSessionId: 'session-3',
  status: 'failed' as const,
  itemCount: 0,
  errorCode: 'run_lost',
  reviewed: false,
  advice: null,
};

describe('InboxScreen — lost runs', () => {
  beforeEach(() => {
    dispatchSpy.mockClear();
    initJobsStore(Prefs.makeInMemory());
  });

  it('shows the calm lost-run copy on the failed card', () => {
    addJob(LOST_JOB);
    const view = render(<InboxScreen />);
    const flat = JSON.stringify(view.toJSON());
    expect(flat).toContain('The server lost track of this one');
    expect(findByTestId(view.toJSON(), 'inbox-retry-0')).toBeTruthy();
  });

  it('renders retry as an icon-only button with accessibility text', () => {
    addJob(LOST_JOB);
    const view = render(<InboxScreen />);
    const retry = findByTestId(view.toJSON(), 'inbox-retry-0');
    expect(retry?.props.accessibilityLabel).toBe('Retry this photo');
    expect(typeof retry?.props.accessibilityHint).toBe('string');
    // Icon-only contract: no visible "Retry now" label text remains.
    expect(JSON.stringify(view.toJSON())).not.toContain('Retry now');
  });

  it('keeps the queue copy for ordinary dispatch failures', () => {
    addJob({ ...LOST_JOB, runId: 'r-offline', errorCode: 'start_failed' });
    const view = render(<InboxScreen />);
    expect(JSON.stringify(view.toJSON())).toContain(
      'Saved — will catalog when the server is reachable',
    );
  });

  it('retry re-dispatches the photo in the SAME session and removes the dead job', async () => {
    addJob(LOST_JOB);
    const view = render(<InboxScreen />);

    await act(async () => {
      (findByTestId(view.toJSON(), 'inbox-retry-0')?.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(dispatchSpy).toHaveBeenCalledWith(expect.anything(), 'file:///walk-shot.jpg', {
      roomSessionId: 'session-3',
    });
    expect(
      getJobsStore()
        .getState()
        .jobs.some((j) => j.runId === 'r-dead'),
    ).toBe(false);
  });
});
