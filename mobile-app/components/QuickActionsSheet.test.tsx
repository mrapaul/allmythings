import { render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import QuickActionsSheet from './QuickActionsSheet';

describe('QuickActionsSheet', () => {
  it('renders without throwing', () => {
    const tree = render(
      <QuickActionsSheet visible itemLabel="Lamp" onAction={() => {}} onClose={() => {}} />,
    ).toJSON();
    expect(tree).toBeTruthy();
  });
});
