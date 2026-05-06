import { render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import EmptyState from './EmptyState';

describe('EmptyState', () => {
  it('renders without throwing', () => {
    const tree = render(<EmptyState title="Nothing here" />).toJSON();
    expect(tree).toBeTruthy();
  });
});
