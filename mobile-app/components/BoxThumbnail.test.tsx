import { render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import { BoxThumbnail } from './BoxThumbnail';

describe('BoxThumbnail', () => {
  it('renders without throwing', () => {
    const tree = render(
      <BoxThumbnail
        uri="file:///fake.jpg"
        imageWidth={1280}
        imageHeight={960}
        box={{ x: 0.1, y: 0.1, width: 0.4, height: 0.4 }}
        size={64}
      />,
    ).toJSON();
    expect(tree).toBeTruthy();
  });

  it('handles dimmed and custom border color', () => {
    const tree = render(
      <BoxThumbnail
        uri="file:///fake.jpg"
        imageWidth={400}
        imageHeight={800}
        box={{ x: 0, y: 0, width: 0.5, height: 0.5 }}
        size={48}
        dimmed
        borderColor="#3aa66b"
      />,
    ).toJSON();
    expect(tree).toBeTruthy();
  });
});
