import { act, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const backSpy = vi.fn();
const pushSpy = vi.fn();
const dispatchSpy = vi.fn(async () => ({ ok: true, runId: 'r-1' }));
const takePictureSpy = vi.fn(async () => ({ uri: 'file:///shot.jpg' }));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: pushSpy, replace: vi.fn(), back: backSpy }),
  useLocalSearchParams: () => ({}),
  // The live loop stops on blur; in tests the screen is always focused.
  useFocusEffect: (cb: () => unknown) => {
    cb();
  },
}));

vi.mock('@/services/walk-capture', () => ({ dispatchShot: dispatchSpy }));

const nativeCameraSpy = vi.fn(async () => ({
  canceled: false,
  assets: [{ uri: 'file:///native.jpg' }],
}));
vi.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: async () => ({ granted: true }),
  requestMediaLibraryPermissionsAsync: async () => ({ granted: true }),
  launchCameraAsync: nativeCameraSpy,
  launchImageLibraryAsync: async () => ({ canceled: true }),
}));

// A CameraView whose ref exposes takePictureAsync, so the shutter can run.
vi.mock('expo-camera', async () => {
  const { createElement, forwardRef, useImperativeHandle } = await import('react');
  const CameraView = forwardRef((props: Record<string, unknown>, ref) => {
    useImperativeHandle(ref, () => ({ takePictureAsync: takePictureSpy }));
    return createElement('CameraView', props);
  });
  return {
    CameraView,
    useCameraPermissions: () => [{ granted: true }, async () => ({ granted: true })],
  };
});

const CaptureScreen = (await import('./capture')).default;

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

describe('CaptureScreen', () => {
  beforeEach(() => {
    backSpy.mockClear();
    pushSpy.mockClear();
    dispatchSpy.mockClear();
    takePictureSpy.mockClear();
  });

  it('renders the viewfinder with shutter, close and torch', () => {
    const view = render(<CaptureScreen />);
    expect(findByTestId(view.toJSON(), 'capture-shutter')).toBeTruthy();
    expect(findByTestId(view.toJSON(), 'capture-close')).toBeTruthy();
    expect(findByTestId(view.toJSON(), 'capture-torch')).toBeTruthy();
  });

  it('shutter dispatches the shot and stays on the viewfinder (walk mode)', async () => {
    const view = render(<CaptureScreen />);
    const shutter = findByTestId(view.toJSON(), 'capture-shutter');

    await act(async () => {
      (shutter?.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(takePictureSpy).toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledWith(expect.anything(), 'file:///shot.jpg');
    // Walk mode: no navigation away after a shot.
    expect(backSpy).not.toHaveBeenCalled();
  });

  it('narrates the shot journey on the reel: Sending… then the staged copy', async () => {
    // Hold the dispatch open so the sending state is observable.
    let settle: ((v: { ok: boolean; runId?: string }) => void) | null = null;
    dispatchSpy.mockReturnValueOnce(
      new Promise((resolve) => {
        settle = resolve;
      }) as never,
    );
    const view = render(<CaptureScreen />);
    // The reel is silent until the first shot lands on it.
    expect(findByTestId(view.toJSON(), 'capture-reel')).toBeNull();

    await act(async () => {
      (findByTestId(view.toJSON(), 'capture-shutter')?.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(findByTestId(view.toJSON(), 'capture-reel')).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).toContain('Sending…');

    await act(async () => {
      (settle as ((v: { ok: boolean; runId?: string }) => void) | null)?.({
        ok: true,
        runId: 'r-reel',
      });
      await new Promise((r) => setTimeout(r, 0));
    });
    // Processing speaks the shared staged vocabulary.
    expect(JSON.stringify(view.toJSON())).toContain('Reading the scene…');
    // The old floating ack chip is gone — the reel subsumed it.
    expect(findByTestId(view.toJSON(), 'dispatch-ack')).toBeNull();
  });

  it('keeps one reel frame per shot, each with its own status', async () => {
    // First dispatch never settles (stays Sending…); second resolves.
    dispatchSpy.mockReturnValueOnce(new Promise(() => {}) as never);
    takePictureSpy.mockResolvedValueOnce({ uri: 'file:///shot-1.jpg' } as never);
    const view = render(<CaptureScreen />);

    await act(async () => {
      (findByTestId(view.toJSON(), 'capture-shutter')?.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
      (findByTestId(view.toJSON(), 'capture-shutter')?.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });

    const json = JSON.stringify(view.toJSON());
    const frames = json.match(/"testID":"reel-frame"/g) ?? [];
    expect(frames).toHaveLength(2);
    // The stuck first shot still says Sending… while the second processes.
    expect(json).toContain('Sending…');
    expect(json).toContain('Reading the scene…');
  });

  it('narrates a failed dispatch as saved-for-retry on the reel', async () => {
    dispatchSpy.mockResolvedValueOnce({ ok: false } as never);
    const view = render(<CaptureScreen />);
    await act(async () => {
      (findByTestId(view.toJSON(), 'capture-shutter')?.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(JSON.stringify(view.toJSON())).toContain('Saved — will retry');
  });

  it('reel tap opens the review inbox', async () => {
    const view = render(<CaptureScreen />);
    await act(async () => {
      (findByTestId(view.toJSON(), 'capture-shutter')?.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
      (findByTestId(view.toJSON(), 'capture-reel')?.props.onPress as () => void)();
    });
    expect(pushSpy).toHaveBeenCalledWith('/inbox');
  });

  it('the Done pill leaves the viewfinder', async () => {
    const view = render(<CaptureScreen />);
    await act(async () => {
      (findByTestId(view.toJSON(), 'capture-done')?.props.onPress as () => void)();
    });
    expect(backSpy).toHaveBeenCalled();
  });

  it('shows the first-run narrative once and dismisses it on the first shutter', async () => {
    const view = render(<CaptureScreen />);
    expect(findByTestId(view.toJSON(), 'capture-intro')).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).toContain('Take as many photos as you like');

    await act(async () => {
      (findByTestId(view.toJSON(), 'capture-shutter')?.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(findByTestId(view.toJSON(), 'capture-intro')).toBeNull();
  });

  it('close leaves the viewfinder', async () => {
    const view = render(<CaptureScreen />);
    await act(async () => {
      (findByTestId(view.toJSON(), 'capture-close')?.props.onPress as () => void)();
    });
    expect(backSpy).toHaveBeenCalled();
  });

  it('shows no coaching hint before any frame has been analysed', () => {
    const view = render(<CaptureScreen />);
    // Silence is the default: no hint pill until something is corroborated.
    expect(findByTestId(view.toJSON(), 'coach-hint')).toBeNull();
  });

  it('Done shows how many shots were taken this session', async () => {
    const view = render(<CaptureScreen />);
    expect(JSON.stringify(view.toJSON())).toContain('"Done"');
    await act(async () => {
      (findByTestId(view.toJSON(), 'capture-shutter')?.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(JSON.stringify(view.toJSON())).toContain('Done · 1');
  });

  it('flash cycles off → auto → on like every phone camera', async () => {
    const view = render(<CaptureScreen />);
    const label = () => findByTestId(view.toJSON(), 'capture-flash')?.props.accessibilityLabel;
    expect(label()).toBe('Flash Off');
    await act(async () => {
      (findByTestId(view.toJSON(), 'capture-flash')?.props.onPress as () => void)();
    });
    expect(label()).toBe('Flash Auto');
    await act(async () => {
      (findByTestId(view.toJSON(), 'capture-flash')?.props.onPress as () => void)();
    });
    expect(label()).toBe('Flash On');
  });

  it("the phone's own camera app feeds the same strip and queue", async () => {
    const view = render(<CaptureScreen />);
    await act(async () => {
      (findByTestId(view.toJSON(), 'capture-native')?.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(nativeCameraSpy).toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledWith(expect.anything(), 'file:///native.jpg');
    expect(findByTestId(view.toJSON(), 'capture-reel')).toBeTruthy();
  });
});
