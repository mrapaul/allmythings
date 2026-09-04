import { act, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function collectStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectStrings(child, out);
    return out;
  }
  if (node && typeof node === 'object' && 'children' in node) {
    collectStrings((node as { children: unknown }).children, out);
  }
  return out;
}

// Stub the SSE generator; each test can swap the event script.
const sse = vi.hoisted(() => ({
  events: [] as unknown[],
}));

// Pre-upload quality gate. Default null = "no opinion" (fail open), which is
// also what the real analyzer returns when a frame can't be sampled.
const quality = vi.hoisted(() => ({
  report: null as { verdict: string; advice: string | null } | null,
}));

vi.mock('@/services/image-quality', () => ({
  inspectCaptureQuality: vi.fn(async () => quality.report),
}));

const DEFAULT_EVENTS = [
  { type: 'meta', runId: 'r-test', traceId: 't-test' },
  {
    type: 'item',
    item: {
      label: 'Sofa',
      description: 'leather couch',
      category: 'Furniture',
      tags: ['leather', 'brown'],
      box: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
    },
  },
  {
    type: 'item',
    item: {
      label: 'Lamp',
      description: '',
      category: 'Lighting',
      tags: ['floor'],
      box: { x: 0.6, y: 0.2, width: 0.2, height: 0.5 },
    },
  },
  { type: 'done', runId: 'r-test', totalItems: 2 },
];

vi.mock('@/api/detect', () => ({
  startDetection: vi.fn(async () => ({
    runId: 'r-test',
    photoSha256: 'ff'.repeat(32),
    statusUrl: '/v1/detect/status/r-test',
  })),
}));

vi.mock('@/api/detect-poll', () => ({
  // eslint-disable-next-line @typescript-eslint/require-await
  pollDetectionEvents: async function* () {
    for (const ev of sse.events) yield ev;
  },
}));

vi.mock('@/api/detect-status', () => ({
  getDetectStatus: vi.fn(async () => ({
    status: 'completed',
    workflowId: 'r-test',
    result: { items: [] },
  })),
}));

// Route params, swappable per test (walk-mode resume passes a runId).
const routeParams = vi.hoisted(() => ({
  current: { imageUri: 'file:///fake.jpg' } as Record<string, string>,
}));

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => routeParams.current,
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    back: () => undefined,
  }),
}));

vi.mock('@/contexts/HomesContext', () => ({
  useHomes: () => ({
    activeHomeId: 'home-1',
  }),
}));

vi.mock('@/contexts/InventoryContext', () => ({
  useInventory: () => ({
    items: [],
    addItems: vi.fn(async () => ['item-1']),
    deleteItem: vi.fn(async () => undefined),
    deleteItems: vi.fn(async () => undefined),
  }),
}));

vi.mock('@/stores/prefs', () => ({
  Prefs: {
    makeMmkv: () => ({
      getLastDetectionRunId: () => null,
      setLastDetectionRunId: () => undefined,
      getApiBaseUrlOverride: () => null,
      setApiBaseUrlOverride: () => undefined,
      getCorrectionsQueue: () => [],
      setCorrectionsQueue: () => undefined,
      getPendingCaptures: () => [],
      setPendingCaptures: () => undefined,
      getDiscoveredApiUrl: () => null,
      setDiscoveredApiUrl: () => undefined,
      getReviewState: () => null,
      setReviewState: () => undefined,
    }),
  },
}));

const DetectionScreen = (await import('./detection')).default;

describe('DetectionScreen', () => {
  beforeEach(() => {
    sse.events = [...DEFAULT_EVENTS];
    quality.report = null;
    routeParams.current = { imageUri: 'file:///fake.jpg' };
  });

  it('renders without throwing', () => {
    const tree = render(<DetectionScreen />).toJSON();
    expect(tree).toBeTruthy();
  });

  it('renders overlay labels for detected boxes', async () => {
    const view = render(<DetectionScreen />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const texts = collectStrings(view.toJSON());
    expect(texts).toContain('Sofa');
    expect(texts).toContain('Lamp');
  });

  it('shows a reject card when the server verdict is not ok', async () => {
    sse.events = [
      { type: 'meta', runId: 'r-test', traceId: 't-test', photoSha256: 'ff'.repeat(32) },
      {
        type: 'scene',
        scene: {
          type: 'room',
          estimatedTotalItems: 0,
          verdict: 'too_blurry',
          verdictReason: 'severe motion blur',
        },
      },
      { type: 'done', runId: 'r-test', totalItems: 0 },
    ];
    const view = render(<DetectionScreen />);
    // Flush the async detect stream + state updates.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const texts = collectStrings(view.toJSON());
    expect(texts).toContain('Photo rejected: too blurry');
    expect(texts).toContain('severe motion blur');
    expect(texts).toContain('Retake');
  });
});

/**
 * Pre-upload quality gate. This branch replaced the bytes-per-pixel
 * heuristic (lib/photo-quality.ts) with the same on-device pixel analysis the
 * live viewfinder uses, so the gate and the coach cannot disagree.
 */
describe('DetectionScreen pre-upload quality gate', () => {
  beforeEach(async () => {
    sse.events = [...DEFAULT_EVENTS];
    quality.report = null;
    const detect = await import('@/api/detect');
    vi.mocked(detect.startDetection).mockClear();
  });

  it('uploads when the analyzer has no complaint', async () => {
    const detect = await import('@/api/detect');
    render(<DetectionScreen />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(detect.startDetection).toHaveBeenCalled();
  });

  it('fails open and uploads when the frame could not be analysed', async () => {
    // null report = "no opinion"; a decode failure must never block a capture.
    quality.report = null;
    const detect = await import('@/api/detect');
    render(<DetectionScreen />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(detect.startDetection).toHaveBeenCalled();
  });

  it('holds the upload and names the actual fault when the frame is unusable', async () => {
    quality.report = {
      verdict: 'too_dark',
      advice: 'Too dark — a little more light usually does it.',
    };
    const detect = await import('@/api/detect');
    const view = render(<DetectionScreen />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const texts = collectStrings(view.toJSON());
    // The card names the specific fault, in the same words the live coach
    // would have used — not the old generic "too dark or blurry".
    expect(texts).toContain('Too dark — a little more light usually does it.');
    expect(texts).toContain('Retake');
    expect(texts).toContain('Use anyway');
    // Nothing is uploaded until the user decides.
    expect(detect.startDetection).not.toHaveBeenCalled();
  });

  it('"Use anyway" overrides the gate and proceeds with the upload', async () => {
    quality.report = {
      verdict: 'too_blurry',
      advice: 'That came out blurry — hold still and try again.',
    };
    const detect = await import('@/api/detect');
    const view = render(<DetectionScreen />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(detect.startDetection).not.toHaveBeenCalled();

    // Find the secondary action on the quality card and invoke it.
    const findPressable = (
      node: unknown,
      label: string,
    ): { props: Record<string, unknown> } | null => {
      if (!node || typeof node !== 'object') return null;
      const n = node as { props?: Record<string, unknown>; children?: unknown[] };
      if (n.props?.accessibilityLabel === label) return n as { props: Record<string, unknown> };
      for (const child of n.children ?? []) {
        const hit = findPressable(child, label);
        if (hit) return hit;
      }
      return null;
    };
    const useAnyway = findPressable(view.toJSON(), 'Use anyway');
    expect(useAnyway).toBeTruthy();

    await act(async () => {
      (useAnyway?.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });

    // The user keeps the final say.
    expect(detect.startDetection).toHaveBeenCalled();
  });
});

/**
 * Incident regression: a server restart wipes in-memory runs. Opening a
 * stuck inbox card (resume with a dead runId) must show the calm lost-run
 * state with the re-run affordance — never an endless spinner.
 */
describe('DetectionScreen resume onto a lost run', () => {
  beforeEach(() => {
    quality.report = null;
    routeParams.current = { imageUri: 'file:///room.jpg', runId: 'r-dead' };
    // The poll layer signals a lost run as an immediate terminal event.
    sse.events = [{ type: 'error', code: 'run_not_found', runId: 'r-dead' }];
  });

  it('renders the lost-run card with the re-run affordance instead of spinning', async () => {
    const view = render(<DetectionScreen />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const texts = collectStrings(view.toJSON());
    expect(texts).toContain('The server lost track of this one');
    expect(texts).toContain('Run it again');
    expect(texts).toContain('View collection');
    // Neither the generic snag copy nor a stuck loading state.
    expect(texts).not.toContain('We hit a snag');
    expect(texts).not.toContain('Reading the scene…');
  });

  it('never shows the lost-run card for an ordinary failed run', async () => {
    sse.events = [{ type: 'error', code: 'detect_run_failed', runId: 'r-dead' }];
    const view = render(<DetectionScreen />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const texts = collectStrings(view.toJSON());
    expect(texts).not.toContain('The server lost track of this one');
  });
});
