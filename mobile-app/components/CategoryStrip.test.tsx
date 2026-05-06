import { render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import CategoryStrip from './CategoryStrip';

describe('CategoryStrip', () => {
  it('renders without throwing', () => {
    const tree = render(
      <CategoryStrip
        categories={[{ key: 'all', label: 'All', count: 0 }]}
        active="all"
        onChange={() => {}}
        sort="newest"
        onSortCycle={() => {}}
      />,
    ).toJSON();
    expect(tree).toBeTruthy();
  });
});
