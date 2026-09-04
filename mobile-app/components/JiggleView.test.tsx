import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { describe, expect, it, vi } from 'vitest';
import { JiggleView } from './JiggleView';

describe('JiggleView', () => {
  it('renders its children when inactive', () => {
    const tree = render(
      <JiggleView active={false} index={0}>
        <Text>tile</Text>
      </JiggleView>,
    ).toJSON();
    expect(JSON.stringify(tree)).toContain('tile');
  });

  it('renders its children when active', () => {
    const tree = render(
      <JiggleView active index={3}>
        <Text>tile</Text>
      </JiggleView>,
    ).toJSON();
    expect(JSON.stringify(tree)).toContain('tile');
  });

  it('still renders children with reduce-motion on (only the wobble is dropped)', async () => {
    const rn = await import('react-native');
    const spy = vi
      .spyOn(rn.AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true as never);
    const tree = render(
      <JiggleView active index={1}>
        <Text>tile</Text>
      </JiggleView>,
    ).toJSON();
    expect(JSON.stringify(tree)).toContain('tile');
    spy.mockRestore();
  });
});
