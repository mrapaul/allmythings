import { setShareModuleForTests } from '@/services/share-item';
import { act, render } from '@testing-library/react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The component itself is real — including its shareItemCard call — so the
// test exercises the actual wiring: Pressable → message + primary photo.
const shareSpy = vi.fn(async (_content: { message: string; url?: string }) => ({}));
const ItemShareButton = (await import('./ItemShareButton')).default;

const ITEM = {
  label: 'armchair',
  createdAt: 1_763_000_000_000,
  primaryPhotoUri: 'file:///armchair.jpg',
};

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

afterEach(() => {
  shareSpy.mockClear();
  setShareModuleForTests(undefined);
});

describe('ItemShareButton', () => {
  it('renders with a stable testID and a label-aware accessibility hint', () => {
    const view = render(<ItemShareButton item={ITEM} />);
    const btn = findByTestId(view.toJSON(), 'item-share-button');
    expect(btn).toBeTruthy();
    expect(btn?.props.accessibilityLabel).toBe('Share armchair');
  });

  it('honours a custom testID so hosts can scope queries', () => {
    const view = render(<ItemShareButton item={ITEM} testID="detail-share" />);
    expect(findByTestId(view.toJSON(), 'detail-share')).toBeTruthy();
  });

  it('shares a Label — added <date> card with the primary photo on press', async () => {
    setShareModuleForTests({ share: shareSpy });
    const view = render(<ItemShareButton item={ITEM} />);
    const btn = findByTestId(view.toJSON(), 'item-share-button');
    await act(async () => {
      (btn?.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(shareSpy).toHaveBeenCalledTimes(1);
    const content = shareSpy.mock.calls[0]?.[0];
    expect(content?.message).toContain('armchair');
    expect(content?.message).toContain('added');
    expect(content?.url).toBe('file:///armchair.jpg');
  });
});
