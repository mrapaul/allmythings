import { render } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';
import LocationField from './LocationField';

function findByTestId(node: unknown, testID: string): { props: Record<string, unknown> } | null {
  if (!node || typeof node !== 'object') return null;
  const n = node as { props?: Record<string, unknown>; children?: unknown[] };
  if (n.props?.testID === testID) return n as { props: Record<string, unknown> };
  for (const child of n.children ?? []) {
    const hit = findByTestId(child, testID);
    if (hit) return hit;
  }
  return null;
}

describe('LocationField', () => {
  it('renders without throwing', () => {
    const tree = render(<LocationField value="" onChange={() => {}} recents={[]} />).toJSON();
    expect(tree).toBeTruthy();
  });

  it('offers each recent location as a one-tap chip', () => {
    const tree = render(
      <LocationField
        value=""
        onChange={() => {}}
        recents={['hallway closet — top shelf', 'garage']}
      />,
    ).toJSON();
    const chip = findByTestId(tree, 'location-chip-hallway closet — top shelf');
    expect(chip).toBeTruthy();
    expect(chip?.props.accessibilityLabel).toBe('Location hallway closet — top shelf');
    expect(findByTestId(tree, 'location-chip-garage')).toBeTruthy();
  });

  it('hides the chip row when there are no recents', () => {
    const tree = render(<LocationField value="" onChange={() => {}} recents={[]} />).toJSON();
    expect(findByTestId(tree, 'location-recents')).toBeNull();
  });

  it('tapping a chip selects it; tapping the active chip clears again', () => {
    const onChange = vi.fn();
    const tree = render(
      <LocationField value="" onChange={onChange} recents={['garage']} />,
    ).toJSON();
    const chip = findByTestId(tree, 'location-chip-garage');
    (chip?.props.onPress as () => void)();
    expect(onChange).toHaveBeenCalledWith('garage');

    // Active chip is a toggle: same tap again clears the choice.
    const active = render(
      <LocationField value="garage" onChange={onChange} recents={['garage']} />,
    ).toJSON();
    (findByTestId(active, 'location-chip-garage')?.props.onPress as () => void)();
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('typing flows through onChange; the clear button resets and commits', () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    const tree = render(
      <LocationField value="attic" onChange={onChange} recents={[]} onCommit={onCommit} />,
    ).toJSON();
    const input = findByTestId(tree, 'location-input');
    expect(input).toBeTruthy();
    (input?.props.onChangeText as (v: string) => void)('attic — blue bin');
    expect(onChange).toHaveBeenCalledWith('attic — blue bin');

    // Submitting the keyboard commits the current value.
    (input?.props.onSubmitEditing as () => void)();
    expect(onCommit).toHaveBeenCalledWith('attic');

    // The clear-X appears only when there is text; it resets AND commits ''.
    const clear = findByLabel(tree, 'Clear location');
    expect(clear).toBeTruthy();
    (clear?.props.onPress as () => void)();
    expect(onChange).toHaveBeenCalledWith('');
    expect(onCommit).toHaveBeenCalledWith('');

    const empty = render(<LocationField value="" onChange={onChange} recents={[]} />).toJSON();
    expect(findByLabel(empty, 'Clear location')).toBeNull();
  });

  it('routes chip taps through onSelectChip when provided', () => {
    const onChange = vi.fn();
    const onSelectChip = vi.fn();
    const tree = render(
      <LocationField
        value=""
        onChange={onChange}
        recents={['garage']}
        onSelectChip={onSelectChip}
      />,
    ).toJSON();
    (findByTestId(tree, 'location-chip-garage')?.props.onPress as () => void)();
    expect(onSelectChip).toHaveBeenCalledWith('garage');
    expect(onChange).not.toHaveBeenCalled();
  });
});

function findByLabel(node: unknown, label: string): { props: Record<string, unknown> } | null {
  if (!node || typeof node !== 'object') return null;
  const n = node as { props?: Record<string, unknown>; children?: unknown[] };
  if (n.props?.accessibilityLabel === label) return n as { props: Record<string, unknown> };
  for (const child of n.children ?? []) {
    const hit = findByLabel(child, label);
    if (hit) return hit;
  }
  return null;
}
