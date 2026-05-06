import { render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import SearchHeader from './SearchHeader';

describe('SearchHeader', () => {
  it('renders without throwing', () => {
    const tree = render(<SearchHeader value="" onChange={() => {}} />).toJSON();
    expect(tree).toBeTruthy();
  });
});
