import { render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import ErrorFallback from './ErrorFallback';

describe('ErrorFallback', () => {
  it('renders without throwing', () => {
    const tree = render(<ErrorFallback error={new Error('boom')} resetError={() => {}} />).toJSON();
    expect(tree).toBeTruthy();
  });
});
