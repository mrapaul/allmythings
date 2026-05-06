import { render } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';

// Stub the SSE generator to yield meta + 2 items + done synchronously.
vi.mock('@/api/detect', async () => {
  const actual = await vi.importActual<typeof import('@/api/detect')>('@/api/detect');
  return {
    ...actual,
    detectImageStream: async function* () {
      yield { type: 'meta', runId: 'r-test', traceId: 't-test' } as const;
      yield {
        type: 'item',
        item: {
          label: 'Sofa',
          description: 'leather couch',
          category: 'Furniture',
          tags: ['leather', 'brown'],
          box: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
        },
      } as const;
      yield {
        type: 'item',
        item: {
          label: 'Lamp',
          description: '',
          category: 'Lighting',
          tags: ['floor'],
          box: { x: 0.6, y: 0.2, width: 0.2, height: 0.5 },
        },
      } as const;
      yield { type: 'done', runId: 'r-test', totalItems: 2 } as const;
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
    }),
  },
}));

const DetectionScreen = (await import('./detection')).default;

describe('DetectionScreen', () => {
  it('renders without throwing', () => {
    const tree = render(<DetectionScreen />).toJSON();
    expect(tree).toBeTruthy();
  });
});
