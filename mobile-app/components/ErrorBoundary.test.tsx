import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { describe, expect, it } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

describe('ErrorBoundary', () => {
  it('renders without throwing', () => {
    const tree = render(
      <ErrorBoundary>
        <Text>child</Text>
      </ErrorBoundary>,
    ).toJSON();
    expect(tree).toBeTruthy();
  });
});
