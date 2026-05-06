import { Repo } from '@/db/repository';
import { makeTestDb } from '@/db/test-helpers';
import { PhotoStorage } from '@/services/photo-storage';
import { Prefs } from '@/stores/prefs';
import { act, render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import { HomesProvider } from './HomesContext';
import { InventoryProvider, useInventory } from './InventoryContext';

describe('InventoryContext', () => {
  it('adds two items sharing one source photo (deduped to one file copy)', async () => {
    const repo = new Repo(makeTestDb());
    const prefs = Prefs.makeInMemory();
    const copies: Array<{ from: string; to: string }> = [];
    const photo = new PhotoStorage({
      documentDirectory: 'file:///d/',
      ensureDir: async () => {},
      copy: async (a) => {
        copies.push(a);
      },
    });
    let api: ReturnType<typeof useInventory> | undefined;
    function Capture() {
      api = useInventory();
      return null;
    }
    render(
      <HomesProvider repo={repo} prefs={prefs}>
        <InventoryProvider repo={repo} photoStorage={photo}>
          <Capture />
        </InventoryProvider>
      </HomesProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
      await api?.addItems([
        {
          label: 'A',
          description: '',
          category: 'Misc',
          tags: [],
          primaryPhotoUri: 'file:///c/IMG.jpg',
          additionalPhotoUris: [],
          notes: '',
          box: { x: 0, y: 0, width: 0.1, height: 0.1 },
        },
        {
          label: 'B',
          description: '',
          category: 'Misc',
          tags: [],
          primaryPhotoUri: 'file:///c/IMG.jpg',
          additionalPhotoUris: [],
          notes: '',
          box: { x: 0, y: 0, width: 0.1, height: 0.1 },
        },
      ]);
    });
    expect(copies).toHaveLength(1);
    expect(api?.items).toHaveLength(2);
  });
});
