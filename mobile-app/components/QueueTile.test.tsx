import { resolveColors } from '@/hooks/useColors';
import type { DetectionJob } from '@/lib/jobs';
import { act, render } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';
import { QueueTile } from './QueueTile';

const colors = resolveColors('light');

function job(patch: Partial<DetectionJob>): DetectionJob {
  return {
    runId: 'r1',
    photoUri: 'file:///a.jpg',
    startedAt: 0,
    roomSessionId: 'session-1',
    status: 'running',
    itemCount: 0,
    errorCode: null,
    reviewed: false,
    ...patch,
  };
}

function findByTestId(node: unknown, testID: string): { props: Record<string, unknown> } | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findByTestId(child, testID);
      if (hit) return hit;
    }
    return null;
  }
  const n = node as { props?: Record<string, unknown>; children?: unknown };
  if (n.props?.testID === testID) return n as { props: Record<string, unknown> };
  return findByTestId(n.children, testID);
}

const pressNoop = vi.fn();

describe('QueueTile progress states', () => {
  it('renders a determinate ring with an a11y value when counts exist', () => {
    const view = render(
      <QueueTile
        job={job({ progressItems: 2, sceneEstimate: 8 })}
        index={0}
        colors={colors}
        onPress={pressNoop}
      />,
    );
    const tree = view.toJSON();
    expect(findByTestId(tree, 'queue-tile-progress-0')).toBeTruthy();
    expect(findByTestId(tree, 'queue-tile-spinner-0')).toBeNull();
    const tile = findByTestId(tree, 'queue-tile-0');
    expect(tile?.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 25 });
  });

  it('falls back to the indeterminate spinner when counts are missing', () => {
    const view = render(<QueueTile job={job({})} index={0} colors={colors} onPress={pressNoop} />);
    const tree = view.toJSON();
    expect(findByTestId(tree, 'queue-tile-spinner-0')).toBeTruthy();
    expect(findByTestId(tree, 'queue-tile-progress-0')).toBeNull();
    expect(findByTestId(tree, 'queue-tile-0')?.props.accessibilityValue).toBeUndefined();
  });

  it('renders the check-pop overlay for a just-ready ghost job', () => {
    const view = render(
      <QueueTile
        job={job({ status: 'ready', itemCount: 3 })}
        index={0}
        colors={colors}
        onPress={pressNoop}
      />,
    );
    const tree = view.toJSON();
    expect(findByTestId(tree, 'queue-tile-0')?.props.accessibilityLabel).toBe(
      'Scan ready — open to review',
    );
    expect(findByTestId(tree, 'queue-tile-spinner-0')).toBeNull();
    expect(findByTestId(tree, 'queue-tile-progress-0')).toBeNull();
  });

  it('breathes a retry countdown for failed jobs on the auto-retry ladder', async () => {
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(
        <QueueTile
          job={job({
            status: 'failed',
            errorCode: 'run_lost',
            attempts: 1,
            nextRetryAt: Date.now() + 30_000,
          })}
          index={0}
          colors={colors}
          onPress={pressNoop}
        />,
      );
    });
    const tree = view.toJSON();
    expect(findByTestId(tree, 'queue-tile-warning-0')).toBeTruthy();
    const countdown = findByTestId(tree, 'queue-tile-0');
    expect(countdown).toBeTruthy();
    // The countdown pill hangs off the failed tile's own subtree.
    const texts = JSON.stringify(tree);
    expect(texts).toContain('Retry in');
  });

  it('omits the countdown when the failure is not auto-retrying', () => {
    const view = render(
      <QueueTile
        job={job({ status: 'failed', errorCode: 'vlm_timeout' })}
        index={0}
        colors={colors}
        onPress={pressNoop}
      />,
    );
    expect(JSON.stringify(view.toJSON())).not.toContain('Retry in');
  });
});
