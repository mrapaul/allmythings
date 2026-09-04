import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveQuality } from './useLiveQuality';

/**
 * Loop discipline, not image maths: the sampling loop must never run two
 * analyses at once, must stop when disabled, and must stand down while a
 * user-initiated capture is in flight.
 */

vi.mock('expo-router', () => ({
  useFocusEffect: (cb: () => unknown) => {
    cb();
  },
}));

vi.mock('@/services/image-prep', () => ({
  // No base64 -> the loop records a neutral observation and reschedules.
  prepareJpegBase64: vi.fn(async () => null),
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

function Probe({
  camera,
  enabled,
  onApi,
}: {
  camera: { current: { takePictureAsync: (o: unknown) => Promise<{ uri: string }> } | null };
  enabled: boolean;
  onApi?: (api: ReturnType<typeof useLiveQuality>) => void;
}) {
  const api = useLiveQuality({ camera: camera as never, enabled, intervalMs: 5 });
  onApi?.(api);
  return <Text>{api.hint?.message ?? 'silent'}</Text>;
}

describe('useLiveQuality loop', () => {
  let inFlight = 0;
  let maxConcurrent = 0;
  let calls = 0;

  const slowCamera = {
    current: {
      takePictureAsync: async () => {
        calls++;
        inFlight++;
        maxConcurrent = Math.max(maxConcurrent, inFlight);
        await new Promise((r) => setTimeout(r, 20));
        inFlight--;
        return { uri: `file:///sample-${calls}.jpg` };
      },
    },
  };

  beforeEach(() => {
    inFlight = 0;
    maxConcurrent = 0;
    calls = 0;
  });

  it('never runs two analyses at once, even when sampling is slower than the interval', async () => {
    const view = render(<Probe camera={slowCamera} enabled />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });
    expect(calls).toBeGreaterThan(0);
    expect(maxConcurrent).toBe(1);
    view.unmount();
  });

  it('does not sample at all while disabled', async () => {
    const view = render(<Probe camera={slowCamera} enabled={false} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(calls).toBe(0);
    view.unmount();
  });

  it('stops sampling once unmounted (screen left)', async () => {
    const view = render(<Probe camera={slowCamera} enabled />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    const afterMount = calls;
    view.unmount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
    // At most the one already in flight may complete.
    expect(calls - afterMount).toBeLessThanOrEqual(1);
  });

  it('stands down while a user capture holds the camera', async () => {
    let api: ReturnType<typeof useLiveQuality> | null = null;
    const view = render(
      <Probe
        camera={slowCamera}
        enabled
        onApi={(a) => {
          api = a;
        }}
      />,
    );
    await act(async () => {
      await flush();
    });
    await act(async () => {
      (api as ReturnType<typeof useLiveQuality> | null)?.suspendForCapture();
      await new Promise((r) => setTimeout(r, 60));
    });
    const during = calls;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    // Suspended: the loop keeps rescheduling but takes no pictures.
    expect(calls).toBe(during);
    view.unmount();
  });

  it('starts silent — no hint before anything is corroborated', () => {
    const view = render(<Probe camera={slowCamera} enabled={false} />);
    expect(JSON.stringify(view.toJSON())).toContain('silent');
    view.unmount();
  });
});
