import { render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import GlowBackdrop from './GlowBackdrop';

describe('GlowBackdrop', () => {
  it('renders without throwing', () => {
    const tree = render(<GlowBackdrop />).toJSON();
    expect(tree).toBeTruthy();
  });
});
