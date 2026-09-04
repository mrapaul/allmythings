import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './useDebouncedValue';

function Probe({ value }: { value: string }) {
  const debounced = useDebouncedValue(value, 150);
  return <Text>{debounced}</Text>;
}

function textOf(tree: unknown): string {
  return JSON.stringify(tree);
}

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('settles on the latest value only after the delay', () => {
    const view = render(<Probe value="a" />);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(textOf(view.toJSON())).toContain('a');

    act(() => {
      view.update(<Probe value="ab" />);
    });
    act(() => {
      view.update(<Probe value="abc" />);
    });
    // Not yet — still inside the debounce window.
    expect(textOf(view.toJSON())).toContain('a');
    expect(textOf(view.toJSON())).not.toContain('abc');

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(textOf(view.toJSON())).toContain('abc');
  });
});
