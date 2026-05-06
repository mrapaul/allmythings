import { render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import PrimaryButton from './PrimaryButton';

describe('PrimaryButton', () => {
  it('renders without throwing', () => {
    const tree = render(<PrimaryButton title="Tap" onPress={() => {}} />).toJSON();
    expect(tree).toBeTruthy();
  });
});
