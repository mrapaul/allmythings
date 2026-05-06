import { FlashList } from '@shopify/flash-list';
import type { ReactElement } from 'react';

interface Props<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  getAspectRatio: (item: T) => number;
  renderItem: (info: { item: T; index: number }) => ReactElement;
  columns: number;
  gutter?: number;
  ListEmptyComponent?: ReactElement;
  ListHeaderComponent?: ReactElement;
}

/**
 * Pinterest-style masonry built on `@shopify/flash-list` v2's
 * `FlashList` with `masonry` enabled. v2 collapsed the previous
 * `MasonryFlashList` component into the base list. The per-item
 * aspect ratio is consumed by the caller's `renderItem` (typically
 * via `style={{ aspectRatio }}` on the tile wrapper) — v2 sizes
 * tiles automatically and no longer takes `estimatedItemSize`.
 */
export default function MasonryGrid<T>(props: Props<T>) {
  const gutter = props.gutter ?? 12;
  // `getAspectRatio` is part of the stable public API. v2 of FlashList
  // sizes masonry tiles automatically based on rendered content, so
  // callers apply the ratio to their tile wrapper (`style={{ aspectRatio }}`)
  // inside renderItem instead of us forwarding it to the list.
  void props.getAspectRatio;
  return (
    <FlashList<T>
      data={props.items}
      keyExtractor={props.keyExtractor}
      numColumns={props.columns}
      masonry
      optimizeItemArrangement
      renderItem={({ item, index }) => props.renderItem({ item, index })}
      ListEmptyComponent={props.ListEmptyComponent}
      ListHeaderComponent={props.ListHeaderComponent}
      contentContainerStyle={{ padding: gutter }}
    />
  );
}
