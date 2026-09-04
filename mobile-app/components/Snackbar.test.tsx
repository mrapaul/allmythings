import { render } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';
import { Snackbar } from './Snackbar';

describe('Snackbar', () => {
  it('renders message and actions when visible', () => {
    const tree = render(
      <Snackbar
        visible
        message="3 items saved · 47 in your home"
        actionLabel="Undo"
        onAction={vi.fn()}
        secondaryLabel="View collection"
        onSecondary={vi.fn()}
        testID="save-undo-snackbar"
      />,
    ).toJSON();
    const flat = JSON.stringify(tree);
    expect(flat).toContain('3 items saved · 47 in your home');
    expect(flat).toContain('Undo');
    expect(flat).toContain('View collection');
  });

  it('renders nothing when not visible', () => {
    const tree = render(<Snackbar visible={false} message="hidden" />).toJSON();
    expect(tree).toBeNull();
  });
});
