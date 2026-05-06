import { render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import ItemCard from './ItemCard';

describe('ItemCard', () => {
  it('renders without throwing', () => {
    const item = {
      id: '1',
      label: 'Lamp',
      description: 'Brass floor lamp',
      category: 'Lighting',
      tags: [],
      box: { x: 0, y: 0, width: 0.2, height: 0.4 },
      included: true,
    };
    const tree = render(
      <ItemCard item={item} onUpdate={() => {}} onToggle={() => {}} onDelete={() => {}} />,
    ).toJSON();
    expect(tree).toBeTruthy();
  });
});
