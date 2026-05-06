import { describe, expect, it } from 'vitest';
import { type FileSystemPort, PhotoStorage } from './photo-storage';

function makeFs(): FileSystemPort & { copies: Array<{ from: string; to: string }> } {
  const copies: Array<{ from: string; to: string }> = [];
  return {
    documentDirectory: 'file:///doc/',
    copies,
    async ensureDir() {},
    async copy(args) {
      copies.push(args);
    },
  };
}

describe('PhotoStorage', () => {
  it('copies a photo into inventory dir under a deterministic name', async () => {
    const fs = makeFs();
    const ps = new PhotoStorage(fs);
    const dest = await ps.savePhoto('file:///cache/IMG_0001.jpg', 'photo_1');
    expect(dest).toBe('file:///doc/inventory/photo_1.jpg');
    expect(fs.copies).toEqual([{ from: 'file:///cache/IMG_0001.jpg', to: dest }]);
  });

  it('falls back to source uri when copy fails', async () => {
    const ps = new PhotoStorage({
      documentDirectory: 'file:///doc/',
      ensureDir: async () => {},
      copy: async () => {
        throw new Error('nope');
      },
    });
    const out = await ps.savePhoto('file:///source.jpg', 'p');
    expect(out).toBe('file:///source.jpg');
  });
});
