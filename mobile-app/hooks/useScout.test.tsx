import type { DetectStreamEvent } from '@/api/types';
import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useScout } from './useScout';

/**
 * Run lifecycle: the reducer itself is unit-tested in lib/scout — these tests
 * cover the hook's own contract: progressive merge from the wire, cancel
 * semantics (manual / concurrent / motion / disable), auto-arm latching, and
 * silent failure.
 */

// Each streamScoutEvents call parks its handlers here so a test can drive
// events and settle the stream by hand.
const streams = vi.hoisted(() => ({
  pending: [] as Array<{
    handlers: { onEvent: (e: DetectStreamEvent) => void };
    resolve: () => void;
    reject: (err: Error) => void;
  }>,
}));

vi.mock('@/api/scout', () => ({
  streamScoutEvents: vi.fn(
    (_input: unknown, handlers: { onEvent: (e: DetectStreamEvent) => void }) =>
      new Promise<void>((resolve, reject) => {
        streams.pending.push({ handlers, resolve, reject });
      }),
  ),
}));

vi.mock('expo-router', () => ({
  useFocusEffect: (cb: () => unknown) => {
    cb();
  },
}));

import { streamScoutEvents } from '@/api/scout';

const flush = () => new Promise((r) => setTimeout(r, 0));

const item = (label: string): DetectStreamEvent => ({
  type: 'item',
  item: {
    label,
    description: '',
    category: 'Other',
    tags: [],
    box: { x: 0.1, y: 0.2, width: 0.3, height: 0.2 },
  },
});

const camera = {
  current: {
    takePictureAsync: async () => ({ uri: 'file:///scout-sample.jpg' }),
  },
};

type Motion = 'unsteady' | 'tilted' | null;
let latest: ReturnType<typeof useScout> | null = null;

function Probe({
  enabled = true,
  autoArm = false,
  motion = null,
  onApi,
}: {
  enabled?: boolean;
  autoArm?: boolean;
  motion?: Motion;
  onApi?: (api: ReturnType<typeof useScout>) => void;
}) {
  const api = useScout({ camera: camera as never, enabled, autoArm, motion });
  onApi?.(api);
  return <Text>{`${api.state.status}:${api.state.items.length}`}</Text>;
}

const mount = (ui: React.ReactElement) => render(ui);

describe('useScout', () => {
  beforeEach(() => {
    streams.pending = [];
    latest = null;
    vi.mocked(streamScoutEvents).mockClear();
  });

  it('progressively merges item bursts into the overlay model', async () => {
    const view = mount(
      <Probe
        onApi={(a) => {
          latest = a;
        }}
      />,
    );
    await act(async () => {
      latest?.begin();
      await flush();
    });
    expect(latest?.scanning).toBe(true);
    expect(streams.pending).toHaveLength(1);

    await act(async () => {
      streams.pending[0]?.handlers.onEvent({ type: 'meta', runId: 'r1', traceId: 't1' });
      streams.pending[0]?.handlers.onEvent(item('Vase'));
    });
    expect(latest?.state.items.map((i) => i.label)).toEqual(['Vase']);

    await act(async () => {
      streams.pending[0]?.handlers.onEvent(item('Bowl'));
      streams.pending[0]?.handlers.onEvent({ type: 'done', runId: 'r1', totalItems: 2 });
    });
    expect(latest?.state.items.map((i) => i.label)).toEqual(['Vase', 'Bowl']);
    expect(latest?.state.status).toBe('done');
    view.unmount();
  });

  it('cancel hides the overlay and late events from the dead stream are ignored', async () => {
    const view = mount(
      <Probe
        onApi={(a) => {
          latest = a;
        }}
      />,
    );
    await act(async () => {
      latest?.begin();
      await flush();
    });
    await act(async () => {
      streams.pending[0]?.handlers.onEvent(item('Vase'));
    });
    expect(latest?.state.items).toHaveLength(1);

    await act(async () => {
      latest?.cancel();
    });
    expect(latest?.state.status).toBe('idle');
    expect(latest?.state.items).toEqual([]);

    await act(async () => {
      streams.pending[0]?.handlers.onEvent(item('Late'));
      streams.pending[0]?.resolve();
      await flush();
    });
    expect(latest?.state.items).toEqual([]);
    expect(latest?.state.status).toBe('idle');
    view.unmount();
  });

  it('a second begin cancels the in-flight run: only the new run may merge', async () => {
    const view = mount(
      <Probe
        onApi={(a) => {
          latest = a;
        }}
      />,
    );
    await act(async () => {
      latest?.begin();
      await flush();
    });
    const first = streams.pending[0];
    await act(async () => {
      latest?.begin();
      await flush();
    });
    expect(streams.pending).toHaveLength(2);

    // Stale stream events arrive after the restart — dropped.
    await act(async () => {
      first?.handlers.onEvent(item('Stale'));
    });
    expect(latest?.state.items).toEqual([]);

    await act(async () => {
      streams.pending[1]?.handlers.onEvent({ type: 'meta', runId: 'r2', traceId: 't2' });
      streams.pending[1]?.handlers.onEvent(item('Fresh'));
    });
    expect(latest?.state.items.map((i) => i.label)).toEqual(['Fresh']);
    view.unmount();
  });

  it('auto-arms once per ready transition and re-arms only after a dip', async () => {
    const view = mount(
      <Probe
        autoArm
        onApi={(a) => {
          latest = a;
        }}
      />,
    );
    await act(async () => {
      await flush();
    });
    expect(streams.pending).toHaveLength(1);
    const first = streams.pending[0];

    // Steady hold: no re-scan while the first run is alive or after it ends.
    await act(async () => {
      first?.handlers.onEvent({ type: 'done', runId: 'r1', totalItems: 0 });
      first?.resolve();
      await flush();
      await flush();
    });
    expect(streams.pending).toHaveLength(1);

    // Reframe dips readiness, then it settles again → one fresh scout.
    view.update(
      <Probe
        autoArm={false}
        onApi={(a) => {
          latest = a;
        }}
      />,
    );
    await act(async () => {
      await flush();
    });
    view.update(
      <Probe
        autoArm
        onApi={(a) => {
          latest = a;
        }}
      />,
    );
    await act(async () => {
      await flush();
    });
    expect(streams.pending).toHaveLength(2);
    view.unmount();
  });

  it('strong motion cancels a scanning scout', async () => {
    const view = mount(
      <Probe
        motion={null}
        onApi={(a) => {
          latest = a;
        }}
      />,
    );
    await act(async () => {
      latest?.begin();
      await flush();
    });
    await act(async () => {
      streams.pending[0]?.handlers.onEvent(item('Vase'));
    });
    expect(latest?.state.items).toHaveLength(1);

    view.update(
      <Probe
        motion="unsteady"
        onApi={(a) => {
          latest = a;
        }}
      />,
    );
    await act(async () => {
      await flush();
    });
    expect(latest?.state.status).toBe('idle');
    expect(latest?.state.items).toEqual([]);
    view.unmount();
  });

  it('a capture starting (enabled flips false) cancels the scout', async () => {
    const view = mount(
      <Probe
        enabled
        onApi={(a) => {
          latest = a;
        }}
      />,
    );
    await act(async () => {
      latest?.begin();
      await flush();
    });
    expect(latest?.scanning).toBe(true);

    view.update(
      <Probe
        enabled={false}
        onApi={(a) => {
          latest = a;
        }}
      />,
    );
    await act(async () => {
      await flush();
    });
    expect(latest?.state.status).toBe('idle');
    // And a manual begin while disabled is a no-op.
    await act(async () => {
      latest?.begin();
      await flush();
    });
    expect(streams.pending).toHaveLength(1);
    view.unmount();
  });

  it('transport failure hides silently and recovers to idle', async () => {
    const view = mount(
      <Probe
        onApi={(a) => {
          latest = a;
        }}
      />,
    );
    await act(async () => {
      latest?.begin();
      await flush();
    });
    await act(async () => {
      streams.pending[0]?.reject(new Error('scout stream HTTP 503'));
      await flush();
    });
    expect(latest?.state.status).toBe('idle');
    expect(latest?.state.failed).toBe(false);
    view.unmount();
  });

  it('server error event marks the run failed so the caller hides it', async () => {
    const view = mount(
      <Probe
        onApi={(a) => {
          latest = a;
        }}
      />,
    );
    await act(async () => {
      latest?.begin();
      await flush();
    });
    await act(async () => {
      streams.pending[0]?.handlers.onEvent({ type: 'error', code: 'detector_unavailable' });
      streams.pending[0]?.resolve();
      await flush();
    });
    expect(latest?.state.status).toBe('done');
    expect(latest?.state.failed).toBe(true);
    view.unmount();
  });
});
