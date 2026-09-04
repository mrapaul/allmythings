export interface FileSystemPort {
  documentDirectory: string;
  ensureDir(path: string): Promise<void>;
  copy(args: { from: string; to: string }): Promise<void>;
}

const SAFE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic']);

export class PhotoStorage {
  constructor(private fs: FileSystemPort) {}

  static fromExpo(): PhotoStorage {
    interface LegacyFS {
      documentDirectory: string | null;
      getInfoAsync(path: string): Promise<{ exists: boolean }>;
      makeDirectoryAsync(path: string, opts?: { intermediates?: boolean }): Promise<void>;
      copyAsync(args: { from: string; to: string }): Promise<void>;
    }
    // biome-ignore lint/correctness/noNodejsModules: dynamic require keeps expo-file-system out of Vitest
    // biome-ignore lint/suspicious/noExplicitAny: require is intentional for RN-only side-effecting import
    const FileSystem = (require as any)('expo-file-system/legacy') as LegacyFS;
    return new PhotoStorage({
      documentDirectory: FileSystem.documentDirectory ?? '',
      async ensureDir(path) {
        const info = await FileSystem.getInfoAsync(path);
        if (!info.exists) await FileSystem.makeDirectoryAsync(path, { intermediates: true });
      },
      async copy({ from, to }) {
        await FileSystem.copyAsync({ from, to });
      },
    });
  }

  async savePhoto(sourceUri: string, name: string): Promise<string> {
    return this.saveInto('inventory/', sourceUri, name);
  }

  /**
   * Persists a generated per-item thumbnail (manipulator output lives in the
   * volatile cache directory) under documentDirectory/thumbnails/.
   */
  async saveThumbnail(sourceUri: string, name: string): Promise<string> {
    return this.saveInto('thumbnails/', sourceUri, name);
  }

  private async saveInto(subdir: string, sourceUri: string, name: string): Promise<string> {
    const dir = `${this.fs.documentDirectory}${subdir}`;
    await this.fs.ensureDir(dir);
    const ext = (sourceUri.split('.').pop() ?? 'jpg').split('?')[0]?.toLowerCase() ?? 'jpg';
    const safe = SAFE_EXT.has(ext) ? ext : 'jpg';
    const dest = `${dir}${name}.${safe}`;
    try {
      await this.fs.copy({ from: sourceUri, to: dest });
      return dest;
    } catch {
      return sourceUri;
    }
  }
}
