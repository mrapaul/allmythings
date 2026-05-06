import { render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import { BoundingBoxOverlay } from './BoundingBoxOverlay';

describe('BoundingBoxOverlay', () => {
  it('renders without throwing', () => {
    const tree = render(
      <BoundingBoxOverlay
        imageWidth={100}
        imageHeight={100}
        viewWidth={200}
        viewHeight={200}
        boxes={[
          {
            id: 'b1',
            label: 'Sofa',
            box: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
            included: true,
          },
        ]}
        isLoading={false}
      />,
    ).toJSON();
    expect(tree).toBeTruthy();
  });

  it('renders loading scan line without throwing', () => {
    const tree = render(
      <BoundingBoxOverlay
        imageWidth={100}
        imageHeight={100}
        viewWidth={200}
        viewHeight={200}
        boxes={[]}
        isLoading={true}
      />,
    ).toJSON();
    expect(tree).toBeTruthy();
  });
});
