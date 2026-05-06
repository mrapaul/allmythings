import { render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import ActionCapsule from './ActionCapsule';

describe('ActionCapsule', () => {
  it('renders without throwing', () => {
    const tree = render(
      <ActionCapsule onCamera={() => {}} onLibrary={() => {}} onSearchToggle={() => {}} />,
    ).toJSON();
    expect(tree).toBeTruthy();
  });
});
