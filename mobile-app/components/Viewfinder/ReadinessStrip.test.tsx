import { render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import { ReadinessStrip } from './ReadinessStrip';

function findByTestId(node: unknown, testID: string): unknown {
  if (!node || typeof node !== 'object') return null;
  const n = node as { props?: Record<string, unknown>; children?: unknown[] };
  if (n.props?.testID === testID) return n;
  for (const child of n.children ?? []) {
    const hit = findByTestId(child, testID);
    if (hit) return hit;
  }
  return null;
}

function textOf(node: unknown): string {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  return ((node as { children?: unknown[] }).children ?? []).map(textOf).join('');
}

describe('ReadinessStrip', () => {
  it('shows every signal and says good to shoot when ready', () => {
    const tree = render(
      <ReadinessStrip signals={{ steady: 'ok', sharp: 'ok', light: 'ok' }} ready />,
    ).toJSON();
    expect(findByTestId(tree, 'readiness-steady-ok')).toBeTruthy();
    expect(findByTestId(tree, 'readiness-sharp-ok')).toBeTruthy();
    expect(findByTestId(tree, 'readiness-light-ok')).toBeTruthy();
    expect(textOf(findByTestId(tree, 'readiness-verdict'))).toBe('Good to shoot');
  });

  it('marks the failing signal and withholds the verdict', () => {
    const tree = render(
      <ReadinessStrip signals={{ steady: 'ok', sharp: 'warn', light: 'unknown' }} ready={false} />,
    ).toJSON();
    expect(findByTestId(tree, 'readiness-sharp-warn')).toBeTruthy();
    expect(findByTestId(tree, 'readiness-light-unknown')).toBeTruthy();
    expect(textOf(findByTestId(tree, 'readiness-verdict'))).toBe('Settling…');
  });
});
