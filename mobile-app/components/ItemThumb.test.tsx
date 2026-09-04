import { render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import { ItemThumb } from './ItemThumb';

describe('ItemThumb', () => {
  it('renders without throwing', () => {
    const tree = render(
      <ItemThumb uri="file:///photo.jpg" box={{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }} />,
    ).toJSON();
    expect(tree).toBeTruthy();
  });

  it('renders the fallback cover fit for a full-frame box', () => {
    const tree = render(
      <ItemThumb uri="file:///photo.jpg" box={{ x: 0, y: 0, width: 1, height: 1 }} />,
    ).toJSON();
    expect(tree).toBeTruthy();
  });

  it('renders the pre-rendered thumbnail directly when provided', () => {
    const tree = render(
      <ItemThumb
        uri="file:///photo.jpg"
        thumbnailUri="file:///thumbs/item.jpg"
        box={{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }}
      />,
    ).toJSON();
    expect(JSON.stringify(tree)).toContain('file:///thumbs/item.jpg');
    expect(JSON.stringify(tree)).not.toContain('file:///photo.jpg');
  });
});
