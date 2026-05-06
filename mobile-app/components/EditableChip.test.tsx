import { render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import EditableChip from './EditableChip';

describe('EditableChip', () => {
  it('renders without throwing', () => {
    const tree = render(
      <EditableChip label="kitchen" onChange={() => {}} onRemove={() => {}} />,
    ).toJSON();
    expect(tree).toBeTruthy();
  });
});
