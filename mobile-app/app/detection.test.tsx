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

vi.mock('@/api/detect', async () => {
  const actual = await vi.importActual<typeof import('@/api/detect')>('@/api/detect');
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/require-await
    detectImageStream: async function* () {
      for (const ev of sse.events) yield ev;
    },
  };
});

vi.mock('@/api/detect-status', () => ({
  getDetectStatus: vi.fn(async () => ({
    status: 'completed',
    workflowId: 'r-test',
    result: { items: [] },
  })),
}));

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ imageUri: 'file:///fake.jpg' }),
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
    addItems: vi.fn(async () => ['item-1']),
    deleteItem: vi.fn(async () => undefined),
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
    }),
  },
}));

const DetectionScreen = (await import('./detection')).default;

describe('DetectionScreen', () => {
  beforeEach(() => {
    sse.events = [...DEFAULT_EVENTS];
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
