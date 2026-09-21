import { render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';

/**
 * QualityCard variants: the labeled text buttons remain the default, while
 * the `actions` prop swaps in a compact icon-only row whose action names
 * live on accessibilityLabel/accessibilityHint only.
 */

const { resolveColors } = await import('@/hooks/useColors');
const colors = resolveColors('light');
const { QualityCard } = await import('./QualityCard');

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

describe('QualityCard', () => {
  it('renders labeled text buttons by default', () => {
    const view = render(
      <QualityCard
        icon="wifi-off"
        title="Saved"
        body="Will retry."
        primaryLabel="Retry now"
        onPrimary={() => {}}
        secondaryLabel="View collection"
        onSecondary={() => {}}
        colors={colors}
      />,
    );
    const texts = collectStrings(view.toJSON());
    expect(texts).toContain('Retry now');
    expect(texts).toContain('View collection');
  });

  it('renders icon-only actions with accessibility text when provided', () => {
    const onRetry = () => {};
    const view = render(
      <QualityCard
        icon="wifi-off"
        title="Saved"
        body="Will retry."
        primaryLabel="Retry now"
        onPrimary={onRetry}
        secondaryLabel="View collection"
        onSecondary={() => {}}
        colors={colors}
        actions={[
          {
            icon: 'rotate-cw',
            label: 'Retry now',
            hint: 'Retry detection on this saved photo',
            onPress: onRetry,
            variant: 'primary',
          },
          {
            icon: 'grid',
            label: 'View collection',
            hint: 'Go back to your collection',
            onPress: () => {},
          },
        ]}
      />,
    );
    const retry = findByLabel(view.toJSON(), 'Retry now');
    expect(retry).toBeTruthy();
    expect(retry?.props.accessibilityHint).toBe('Retry detection on this saved photo');
    expect(findByLabel(view.toJSON(), 'View collection')).toBeTruthy();
    // Icon-only contract: the action names never render as visible text.
    const texts = collectStrings(view.toJSON());
    expect(texts).not.toContain('Retry now');
    expect(texts).not.toContain('View collection');
    // The card's message copy still shows.
    expect(texts).toContain('Will retry.');
  });
});
