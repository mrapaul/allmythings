import { Repo } from '@/db/repository';
import { makeTestDb } from '@/db/test-helpers';
import { PhotoStorage } from '@/services/photo-storage';
import { Prefs } from '@/stores/prefs';
import { render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import { HomesProvider } from '../contexts/HomesContext';
import { InventoryProvider } from '../contexts/InventoryContext';
import HomePickerSheet from './HomePickerSheet';

describe('HomePickerSheet', () => {
  it('renders without throwing', () => {
    const repo = new Repo(makeTestDb());
    const prefs = Prefs.makeInMemory();
    const photo = new PhotoStorage({
      documentDirectory: 'file:///d/',
      ensureDir: async () => {},
      copy: async () => {},
    });
    const tree = render(
      <HomesProvider repo={repo} prefs={prefs}>
        <InventoryProvider repo={repo} photoStorage={photo}>
          <HomePickerSheet visible={false} onClose={() => {}} />
        </InventoryProvider>
      </HomesProvider>,
    ).toJSON();
    expect(tree).toBeTruthy();
  });
});
