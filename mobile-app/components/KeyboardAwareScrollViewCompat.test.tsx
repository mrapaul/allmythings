import { render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import KeyboardAwareScrollViewCompat from './KeyboardAwareScrollViewCompat';

describe('KeyboardAwareScrollViewCompat', () => {
  it('renders without throwing', () => {
    const tree = render(<KeyboardAwareScrollViewCompat />).toJSON();
    expect(tree).toBeTruthy();
  });
});
