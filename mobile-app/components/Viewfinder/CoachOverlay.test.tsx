import { render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import { CoachOverlay } from './CoachOverlay';

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

describe('CoachOverlay', () => {
  it('shows the single hint message when one is active', () => {
    const tree = render(
      <CoachOverlay hint={{ kind: 'too_dark', message: 'Too dark — a little more light' }} />,
    ).toJSON();
    expect(findByTestId(tree, 'coach-hint')).toBeTruthy();
    expect(JSON.stringify(tree)).toContain('Too dark');
  });

  it('renders NOTHING when the frame is good — positive state lives on the tray', () => {
    const tree = render(<CoachOverlay hint={null} />).toJSON();
    expect(findByTestId(tree, 'coach-hint')).toBeNull();
    // Regression guard for the confusing free-floating tick.
    expect(findByTestId(tree, 'coach-ready')).toBeNull();
    expect(JSON.stringify(tree)).not.toContain('check');
  });

  it('never renders raw measurements', () => {
    const flat = JSON.stringify(
      render(
        <CoachOverlay hint={{ kind: 'too_blurry', message: 'That came out blurry' }} />,
      ).toJSON(),
    );
    expect(flat).not.toMatch(/focusScore|meanLuma|contrast/);
  });
});

describe('CoachOverlay layout', () => {
  it('flows in the column instead of overlaying its siblings', () => {
    const tree = render(
      <CoachOverlay hint={{ kind: 'tilted', message: 'Straighten up a little' }} />,
    ).toJSON() as unknown as { props: { style: Record<string, unknown> } };
    // Regression guard: absolute positioning put the hint pill on top of the
    // readiness strip on device (both rendered at the same y).
    expect(tree.props.style.position).not.toBe('absolute');
  });
});
