export interface FileSystemPort {
  documentDirectory: string;
  ensureDir(path: string): Promise<void>;
  copy(args: { from: string; to: string }): Promise<void>;
}

const SAFE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic']);

export class PhotoStorage {
  constructor(private fs: FileSystemPort) {}

  static fromExpo(): PhotoStorage {
    // biome-ignore lint/correctness/noNodejsModules: dynamic require avoids loading expo-file-system in Vitest
    // biome-ignore lint/suspicious/noExplicitAny: require is intentional for RN-only side-effecting import
    const FileSystem = (require as any)('expo-file-system') as typeof import('expo-file-system');
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
    const dir = `${this.fs.documentDirectory}inventory/`;
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
