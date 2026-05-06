import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { describe, expect, it } from 'vitest';
import MasonryGrid from './MasonryGrid';

// NOTE: The test shim only exposes `render(...).toJSON()` — `getByText`
// is not implemented (see Section 7's findings). The plan suggested
// option A: smoke-render and assert on the JSON tree.
describe('MasonryGrid', () => {
  it('renders without throwing for a non-empty item list', () => {
    const items = Array.from({ length: 6 }).map((_, i) => ({
      id: String(i),
      label: `i${i}`,
    }));
    const tree = render(
      <MasonryGrid
        items={items}
        keyExtractor={(it) => it.id}
        getAspectRatio={() => 1}
        renderItem={({ item }) => <Text>{item.label}</Text>}
        columns={2}
      />,
    ).toJSON();
    expect(tree).toBeTruthy();
  });

  it('renders an empty list without throwing', () => {
    const tree = render(
      <MasonryGrid
        items={[] as { id: string }[]}
        keyExtractor={(it) => it.id}
        getAspectRatio={() => 1}
        renderItem={({ item }) => <Text>{item.id}</Text>}
        columns={2}
      />,
    ).toJSON();
    expect(tree).toBeTruthy();
  });
});
