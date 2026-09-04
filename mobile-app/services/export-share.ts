/**
 * Stages an export file in the cache directory and hands it to the OS share
 * sheet. Both expo-file-system (legacy write API, matching PhotoStorage) and
 * expo-sharing are loaded via dynamic require so Vitest never touches native
 * bindings; expo-sharing is a native module and needs a dev-client rebuild
 * before the share sheet appears.
 */

interface LegacyFsModule {
  cacheDirectory: string | null;
  writeAsStringAsync(uri: string, content: string): Promise<void>;
}

interface SharingModule {
  isAvailableAsync(): Promise<boolean>;
  shareAsync(uri: string, options?: { mimeType?: string; dialogTitle?: string }): Promise<void>;
}

function loadModules(): { fs: LegacyFsModule; sharing: SharingModule } | null {
  try {
    // biome-ignore lint/correctness/noNodejsModules: dynamic require keeps native modules out of Vitest
    // biome-ignore lint/suspicious/noExplicitAny: require is intentional for RN-only modules
    const fs = (require as any)('expo-file-system/legacy') as LegacyFsModule;
    // biome-ignore lint/correctness/noNodejsModules: dynamic require keeps native modules out of Vitest
    // biome-ignore lint/suspicious/noExplicitAny: require is intentional for RN-only modules
    const sharing = (require as any)('expo-sharing') as SharingModule;
    return { fs, sharing };
  } catch {
    return null;
  }
}

export type ShareExportResult = 'shared' | 'unavailable';

/**
 * Writes `content` to a cache file and opens the share sheet. Returns
 * 'unavailable' when the native sharing module isn't linked yet (pre-rebuild
 * builds) so the caller can explain instead of failing silently.
 */
export async function shareExportFile(
  fileName: string,
  content: string,
  mimeType: string,
): Promise<ShareExportResult> {
  const modules = loadModules();
  if (!modules) return 'unavailable';
  const { fs, sharing } = modules;
  if (!fs.cacheDirectory || !(await sharing.isAvailableAsync())) return 'unavailable';
  const uri = `${fs.cacheDirectory}${fileName}`;
  await fs.writeAsStringAsync(uri, content);
  await sharing.shareAsync(uri, { mimeType, dialogTitle: 'Export inventory' });
  return 'shared';
}
