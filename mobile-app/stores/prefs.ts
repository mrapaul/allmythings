import type { Profile } from '@/types/inventory';

export interface KVBackend {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
}

const KEY_ACTIVE_HOME = 'active_home_id';
const KEY_PROFILE = 'profile';
const KEY_LAST_DETECTION_RUN = 'last_detection_run_id';
const KEY_CORRECTIONS_QUEUE = 'corrections_queue';

export class Prefs {
  constructor(private kv: KVBackend) {}

  static makeInMemory(): Prefs {
    const m = new Map<string, string>();
    return new Prefs({
      getString: (k) => m.get(k),
      set: (k, v) => void m.set(k, v),
      delete: (k) => void m.delete(k),
    });
  }

  static makeMmkv(): Prefs {
    // biome-ignore lint/style/useNodejsImportProtocol: react-native-mmkv is RN-only
    // biome-ignore lint/correctness/noNodejsModules: dynamic require avoids loading RN-only module in Vitest
    // biome-ignore lint/suspicious/noExplicitAny: require is intentional for RN-only side-effecting import
    const { MMKV } = (require as any)('react-native-mmkv') as typeof import('react-native-mmkv');
    const storage = new MMKV({ id: 'home-inventory.prefs' });
    return new Prefs({
      getString: (k) => storage.getString(k),
      set: (k, v) => storage.set(k, v),
      delete: (k) => storage.delete(k),
    });
  }

  getActiveHomeId(): string | null {
    return this.kv.getString(KEY_ACTIVE_HOME) ?? null;
  }
  setActiveHomeId(id: string): void {
    this.kv.set(KEY_ACTIVE_HOME, id);
  }

  getProfile(): Profile | null {
    const raw = this.kv.getString(KEY_PROFILE);
    return raw ? (JSON.parse(raw) as Profile) : null;
  }
  setProfile(p: Profile): void {
    this.kv.set(KEY_PROFILE, JSON.stringify(p));
  }

  getCorrectionsQueue(): string[] {
    const raw = this.kv.getString(KEY_CORRECTIONS_QUEUE);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  setCorrectionsQueue(items: string[]): void {
    if (items.length === 0) this.kv.delete(KEY_CORRECTIONS_QUEUE);
    else this.kv.set(KEY_CORRECTIONS_QUEUE, JSON.stringify(items));
  }

  getLastDetectionRunId(): string | null {
    return this.kv.getString(KEY_LAST_DETECTION_RUN) ?? null;
  }
  setLastDetectionRunId(id: string | null): void {
    if (id) this.kv.set(KEY_LAST_DETECTION_RUN, id);
    else this.kv.delete(KEY_LAST_DETECTION_RUN);
  }
}
