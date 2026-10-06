import { act, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function findNode(node: unknown, testID: string): { props: Record<string, unknown> } | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findNode(child, testID);
      if (hit) return hit;
    }
    return null;
  }
  const n = node as { props?: Record<string, unknown>; children?: unknown };
  if (n.props?.testID === testID) return n as { props: Record<string, unknown> };
  return findNode(n.children, testID);
}

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

// Icon-only actions: the button row carries NO visible text — the action
// names live on accessibilityLabel/accessibilityHint only.
function findByLabel(node: unknown, label: string): { props: Record<string, unknown> } | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findByLabel(child, label);
      if (hit) return hit;
    }
    return null;
  }
  const n = node as { props?: Record<string, unknown>; children?: unknown };
  if (n.props?.accessibilityLabel === label) return n as { props: Record<string, unknown> };
  return findByLabel(n.children, label);
}

// Stub the SSE generator; each test can swap the event script.
const sse = vi.hoisted(() => ({
  events: [] as unknown[],
}));

// Annotated-photo download: null by default (the fallback path every other
// test exercises); the annotated-primary-photo suite swaps in a uri.
const annotated = vi.hoisted(() => ({ uri: null as string | null }));

vi.mock('@/services/annotated-photo', () => ({
  fetchAnnotatedPhoto: vi.fn(async () => annotated.uri),
}));

// The inventory sink, exposed so tests can assert what a save persisted.
const inventory = vi.hoisted(() => ({
  addItems: vi.fn(async (_items: Array<{ primaryPhotoUri: string }>) => ['item-1']),
  deleteItem: vi.fn(async () => undefined),
  deleteItems: vi.fn(async () => undefined),
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
    addItems: inventory.addItems,
    deleteItem: inventory.deleteItem,
    deleteItems: inventory.deleteItems,
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
      getRecentLocations: () => [...prefsMock.locations],
      setRecentLocations: (next: string[]) => {
        prefsMock.locations = next;
      },
    }),
  },
}));

const prefsMock = vi.hoisted(() => ({
  locations: [] as string[],
}));

const DetectionScreen = (await import('./detection')).default;

describe('DetectionScreen', () => {
  beforeEach(() => {
    sse.events = [...DEFAULT_EVENTS];
    quality.report = null;
    annotated.uri = null;
    inventory.addItems.mockClear();
    prefsMock.locations = [];
    routeParams.current = { imageUri: 'file:///fake.jpg' };
  });

  it('renders without throwing', () => {
    const tree = render(<DetectionScreen />).toJSON();
    expect(tree).toBeTruthy();
  });

  it('shows the review location field, seeded with recent locations', async () => {
    prefsMock.locations = ['garage', 'hallway closet — top shelf'];
    const view = render(<DetectionScreen />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const texts = collectStrings(view.toJSON());
    expect(texts).toContain('Location for these items');
    expect(findNode(view.toJSON(), 'review-location')).toBeTruthy();
    // Recent chips are offered one-tap; custom entry via the small input.
    expect(findNode(view.toJSON(), 'location-chip-garage')).toBeTruthy();
    expect(findNode(view.toJSON(), 'location-input')).toBeTruthy();
  });

  it('applies the chosen location to every saved row and records it as recent', async () => {
    const view = render(<DetectionScreen />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      (findNode(view.toJSON(), 'location-input')?.props.onChangeText as (v: string) => void)(
        'hallway closet — top shelf',
      );
    });
    await act(async () => {
      (findNode(view.toJSON(), 'save-all')?.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(inventory.addItems).toHaveBeenCalledTimes(1);
    const payloads = inventory.addItems.mock.calls[0]?.[0] as unknown as Array<{
      location: string | null;
    }>;
    // Both review rows (Sofa + Lamp) inherit the one chosen location.
    expect(payloads).toHaveLength(2);
    for (const p of payloads) expect(p.location).toBe('hallway closet — top shelf');
    // The choice joins the recents list for the next review.
    expect(prefsMock.locations).toEqual(['hallway closet — top shelf']);
  });

  it('saves rows without a location when none was chosen', async () => {
    const view = render(<DetectionScreen />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
      (findNode(view.toJSON(), 'save-all')?.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });
    const payloads = inventory.addItems.mock.calls[0]?.[0] as unknown as Array<{
      location: string | null;
    }>;
    for (const p of payloads) expect(p.location).toBeNull();
    expect(prefsMock.locations).toEqual([]);
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
    // Icon-only contract: the action row is glyphs + accessibility text.
    expect(findByLabel(view.toJSON(), 'Retake')).toBeTruthy();
    // No items survived the verdict, so the secondary is 'Dismiss' (the
    // 'Keep results anyway' variant only exists when there are rows).
    expect(findByLabel(view.toJSON(), 'Dismiss')).toBeTruthy();
    expect(texts).not.toContain('Retake');
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
    expect(findByLabel(view.toJSON(), 'Retake')).toBeTruthy();
    expect(findByLabel(view.toJSON(), 'Use anyway')).toBeTruthy();
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
    // Icon-only action row: rotate-cw re-run + grid collection, named via
    // accessibility labels rather than visible button text.
    expect(findByLabel(view.toJSON(), 'Run it again')).toBeTruthy();
    expect(findByLabel(view.toJSON(), 'View collection')).toBeTruthy();
    expect(texts).not.toContain('Run it again');
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

  it('shows identical detections as one row with a count, expandable to each', async () => {
    const book = (y: number) => ({
      type: 'item',
      item: {
        label: 'white book',
        description: '',
        category: 'Books',
        tags: ['white'],
        box: { x: 0.8, y, width: 0.1, height: 0.05 },
      },
    });
    sse.events = [
      { type: 'meta', runId: 'r-group', traceId: 't-group' },
      {
        type: 'item',
        item: {
          label: 'black computer monitor',
          description: '',
          category: 'Electronics',
          tags: ['black'],
          box: { x: 0, y: 0, width: 0.4, height: 0.3 },
        },
      },
      book(0.1),
      book(0.2),
      book(0.3),
      { type: 'done', runId: 'r-group', totalItems: 4 },
    ];
    const view = render(<DetectionScreen />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const json = () => JSON.stringify(view.toJSON());
    // Four detections, two rows: the monitor and one grouped row of books.
    const chip = findNode(view.toJSON(), 'row-group-1');
    expect(chip?.props.accessibilityLabel).toBe('3 of these — show each separately');
    expect((json().match(/"testID":"row-thumb-/g) ?? []).length).toBe(2);

    await act(async () => {
      (chip?.props.onPress as () => void)();
    });
    // Expanded: every book gets its own row and the chip is gone.
    expect((json().match(/"testID":"row-thumb-/g) ?? []).length).toBe(4);
    expect(findNode(view.toJSON(), 'row-group-1')).toBeNull();
  });
});

/**
 * Annotated primary photo: derived from photoSha256, best-effort. When the
 * server's annotated render downloads, it becomes the item's primary photo;
 * a 404/failed download falls back to the existing processed capture.
 */
describe('DetectionScreen annotated primary photo', () => {
  const ANNOTATED_URI = 'file:///cache/annotated_ab.jpg';

  const eventsWithSha = [
    { type: 'meta', runId: 'r-ann', traceId: 't-ann', photoSha256: 'ab'.repeat(32) },
    {
      type: 'item',
      item: {
        label: 'Sofa',
        description: 'leather couch',
        category: 'Furniture',
        tags: ['leather'],
        box: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
      },
    },
    { type: 'done', runId: 'r-ann', totalItems: 1 },
  ];

  beforeEach(() => {
    sse.events = [...eventsWithSha];
    quality.report = null;
    annotated.uri = null;
    inventory.addItems.mockClear();
    routeParams.current = { imageUri: 'file:///fake.jpg' };
  });

  it('uses the annotated render as the saved item primary photo on success', async () => {
    annotated.uri = ANNOTATED_URI;
    const view = render(<DetectionScreen />);
    // Flush the stream (review) AND the annotated download resolution.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      (findNode(view.toJSON(), 'save-all')?.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(inventory.addItems).toHaveBeenCalledTimes(1);
    const payload = inventory.addItems.mock.calls[0]?.[0]?.[0];
    expect(payload?.primaryPhotoUri).toBe(ANNOTATED_URI);
  });

  it('falls back to the processed capture when the annotated render is unavailable', async () => {
    annotated.uri = null; // 404 / failed download
    const view = render(<DetectionScreen />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      (findNode(view.toJSON(), 'save-all')?.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(inventory.addItems).toHaveBeenCalledTimes(1);
    const payload = inventory.addItems.mock.calls[0]?.[0]?.[0];
    // The expo-image-manipulator stub renders to this uri in tests; the
    // point is the RAW capture flow, not the annotated cache file.
    expect(payload?.primaryPhotoUri).toBe('file:///processed.jpg');
  });

  it('never blocks saving when the run has no photoSha256', async () => {
    sse.events = [...DEFAULT_EVENTS]; // meta without photoSha256
    const view = render(<DetectionScreen />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      (findNode(view.toJSON(), 'save-all')?.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(inventory.addItems).toHaveBeenCalledTimes(1);
    const payload = inventory.addItems.mock.calls[0]?.[0]?.[0];
    expect(payload?.primaryPhotoUri).toBe('file:///processed.jpg');
  });
});
