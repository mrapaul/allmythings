import { type DetectionJob, isDetectionJob } from '@/lib/jobs';
import { type PendingCapture, isPendingCapture } from '@/lib/pending-captures';
import { type MergeSuggestion, isMergeSuggestion } from '@/lib/suggestions';
import type { Profile } from '@/types/inventory';

export interface KVBackend {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
}

export type CollectionViewMode = 'overview' | 'grid' | 'list';

const KEY_ACTIVE_HOME = 'active_home_id';
const KEY_COLLECTION_VIEW_MODE = 'collection_view_mode';
const KEY_PROFILE = 'profile';
const KEY_LAST_DETECTION_RUN = 'last_detection_run_id';
const KEY_CORRECTIONS_QUEUE = 'corrections_queue';
const KEY_API_BASE_URL = 'api_base_url_override';
const KEY_DISCOVERED_API_URL = 'discovered_api_url';
const KEY_PENDING_CAPTURES = 'pending_captures';
const KEY_RECENT_SEARCHES = 'recent_searches';
const KEY_RECENT_LOCATIONS = 'recent_locations';
const KEY_CAPTURE_INTRO_SEEN = 'capture_intro_seen';
const KEY_VIEWFINDER_GRID = 'viewfinder_grid';
const KEY_FIRST_REVIEW_DONE = 'first_review_done';
const KEY_DETECTION_JOBS = 'detection_jobs';
const KEY_MERGE_SUGGESTIONS = 'merge_suggestions';
const KEY_DISMISSED_SUGGESTIONS = 'dismissed_suggestions';
/** Jobs older than this are pruned on read — the inbox never grows forever. */
const JOB_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const KEY_REVIEW_STATE = 'review_state';

/** In-progress detection review, restored when the same run resumes. */
export interface ReviewState {
  runId: string;
  tagsByRow: Record<string, string[]>;
  excludedRowIds: string[];
  savedRowIds: string[];
}

function isReviewState(value: unknown): value is ReviewState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.runId === 'string' &&
    typeof v.tagsByRow === 'object' &&
    v.tagsByRow !== null &&
    Array.isArray(v.excludedRowIds) &&
    Array.isArray(v.savedRowIds)
  );
}

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

  getCollectionViewMode(): CollectionViewMode {
    const stored = this.kv.getString(KEY_COLLECTION_VIEW_MODE);
    // Overview is the default: the organization layer is the product's face.
    // Stored 'grid'/'list' from earlier builds remain honoured.
    return stored === 'grid' || stored === 'list' ? stored : 'overview';
  }
  setCollectionViewMode(mode: CollectionViewMode): void {
    this.kv.set(KEY_COLLECTION_VIEW_MODE, mode);
  }

  getProfile(): Profile | null {
    const raw = this.kv.getString(KEY_PROFILE);
    return raw ? (JSON.parse(raw) as Profile) : null;
  }
  setProfile(p: Profile): void {
    this.kv.set(KEY_PROFILE, JSON.stringify(p));
  }

  getApiBaseUrlOverride(): string | null {
    return this.kv.getString(KEY_API_BASE_URL) ?? null;
  }
  setApiBaseUrlOverride(url: string | null): void {
    const trimmed = url?.trim().replace(/\/+$/, '');
    if (trimmed) this.kv.set(KEY_API_BASE_URL, trimmed);
    else this.kv.delete(KEY_API_BASE_URL);
  }

  /** Last-known-good server URL found via mDNS discovery (health-checked). */
  getDiscoveredApiUrl(): string | null {
    return this.kv.getString(KEY_DISCOVERED_API_URL) ?? null;
  }
  setDiscoveredApiUrl(url: string | null): void {
    const trimmed = url?.trim().replace(/\/+$/, '');
    if (trimmed) this.kv.set(KEY_DISCOVERED_API_URL, trimmed);
    else this.kv.delete(KEY_DISCOVERED_API_URL);
  }

  /** Captures whose detection couldn't start; retried when reachable. */
  getPendingCaptures(): PendingCapture[] {
    const raw = this.kv.getString(KEY_PENDING_CAPTURES);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter(isPendingCapture) : [];
    } catch {
      return [];
    }
  }
  setPendingCaptures(items: PendingCapture[]): void {
    if (items.length === 0) this.kv.delete(KEY_PENDING_CAPTURES);
    else this.kv.set(KEY_PENDING_CAPTURES, JSON.stringify(items));
  }

  /** Last committed search queries, most recent first (see lib/search-query). */
  getRecentSearches(): string[] {
    const raw = this.kv.getString(KEY_RECENT_SEARCHES);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  setRecentSearches(queries: string[]): void {
    if (queries.length === 0) this.kv.delete(KEY_RECENT_SEARCHES);
    else this.kv.set(KEY_RECENT_SEARCHES, JSON.stringify(queries));
  }

  /** Last locations the user catalogued into, most recent first. */
  getRecentLocations(): string[] {
    const raw = this.kv.getString(KEY_RECENT_LOCATIONS);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  setRecentLocations(locations: string[]): void {
    if (locations.length === 0) this.kv.delete(KEY_RECENT_LOCATIONS);
    else this.kv.set(KEY_RECENT_LOCATIONS, JSON.stringify(locations));
  }

  /** Walk-mode detection jobs (capture decoupled from review). */
  getDetectionJobs(): DetectionJob[] {
    const raw = this.kv.getString(KEY_DETECTION_JOBS);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      const cutoff = Date.now() - JOB_RETENTION_MS;
      return Array.isArray(parsed)
        ? parsed.filter(isDetectionJob).filter((j) => j.startedAt >= cutoff)
        : [];
    } catch {
      return [];
    }
  }
  setDetectionJobs(jobs: DetectionJob[]): void {
    if (jobs.length === 0) this.kv.delete(KEY_DETECTION_JOBS);
    else this.kv.set(KEY_DETECTION_JOBS, JSON.stringify(jobs));
  }

  /** Outstanding merge suggestions (quiet tidy-up queue). */
  getMergeSuggestions(): MergeSuggestion[] {
    const raw = this.kv.getString(KEY_MERGE_SUGGESTIONS);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter(isMergeSuggestion) : [];
    } catch {
      return [];
    }
  }
  setMergeSuggestions(suggestions: MergeSuggestion[]): void {
    if (suggestions.length === 0) this.kv.delete(KEY_MERGE_SUGGESTIONS);
    else this.kv.set(KEY_MERGE_SUGGESTIONS, JSON.stringify(suggestions));
  }

  /**
   * Pair keys the user marked "not the same" — remembered permanently so a
   * rejected suggestion never comes back.
   */
  getDismissedSuggestions(): string[] {
    const raw = this.kv.getString(KEY_DISMISSED_SUGGESTIONS);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  setDismissedSuggestions(keys: string[]): void {
    if (keys.length === 0) this.kv.delete(KEY_DISMISSED_SUGGESTIONS);
    else this.kv.set(KEY_DISMISSED_SUGGESTIONS, JSON.stringify(keys));
  }

  /** One-time viewfinder narrative overlay (first-run teaching). */
  getCaptureIntroSeen(): boolean {
    return this.kv.getString(KEY_CAPTURE_INTRO_SEEN) === '1';
  }
  setCaptureIntroSeen(): void {
    this.kv.set(KEY_CAPTURE_INTRO_SEEN, '1');
  }

  /** Rule-of-thirds grid on the viewfinder (capture-screen chip). */
  getViewfinderGrid(): boolean {
    return this.kv.getString(KEY_VIEWFINDER_GRID) === '1';
  }
  setViewfinderGrid(on: boolean): void {
    if (on) this.kv.set(KEY_VIEWFINDER_GRID, '1');
    else this.kv.delete(KEY_VIEWFINDER_GRID);
  }

  /** Set once the very first completed run has been walked into the inbox. */
  getFirstReviewDone(): boolean {
    return this.kv.getString(KEY_FIRST_REVIEW_DONE) === '1';
  }
  setFirstReviewDone(): void {
    this.kv.set(KEY_FIRST_REVIEW_DONE, '1');
  }

  getReviewState(): ReviewState | null {
    const raw = this.kv.getString(KEY_REVIEW_STATE);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return isReviewState(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  setReviewState(state: ReviewState | null): void {
    if (state) this.kv.set(KEY_REVIEW_STATE, JSON.stringify(state));
    else this.kv.delete(KEY_REVIEW_STATE);
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
