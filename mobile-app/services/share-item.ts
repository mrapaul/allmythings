/**
 * Per-item share card — the "do I own this?" answer a family member can
 * forward. React Native's Share is loaded via dynamic require so Vitest never
 * touches native bindings (mirroring services/export-share.ts); tests inject
 * a stand-in via setShareModuleForTests.
 */

export interface ShareableItem {
  label: string;
  createdAt: number;
  /** Forward-compatible: location lands on the item with a sibling branch. */
  location?: string | null;
}

interface ShareContent {
  message?: string;
  url?: string;
  title?: string;
}

export interface ShareModule {
  share(content: ShareContent): Promise<unknown>;
}

export type ShareItemResult = 'shared' | 'text-only' | 'unavailable';

let testOverride: ShareModule | null | undefined;

/** Test seam: inject a Share stand-in (or null); undefined restores the native lookup. */
export function setShareModuleForTests(module_: ShareModule | null | undefined): void {
  testOverride = module_;
}

function loadShare(): ShareModule | null {
  if (testOverride !== undefined) return testOverride;
  try {
    // biome-ignore lint/correctness/noNodejsModules: dynamic require keeps native modules out of Vitest
    // biome-ignore lint/suspicious/noExplicitAny: require is intentional for RN-only modules
    const rn = (require as any)('react-native') as { Share?: ShareModule };
    return rn?.Share ?? null;
  } catch {
    return null;
  }
}

/** 'Label — location when known — added Oct 6, 2026'. */
export function buildShareMessage(item: ShareableItem): string {
  const added = new Date(item.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const where = item.location?.trim();
  return [item.label, ...(where ? [where] : []), `added ${added}`].join(' — ');
}

/**
 * Shares the item card with its primary photo when one is available. If the
 * photo share is rejected (target refuses the file) it retries text-only;
 * dismissal or a missing module resolves 'unavailable' — sharing is a
 * convenience and must never throw.
 */
export async function shareItemCard(
  item: ShareableItem,
  photoUri?: string,
): Promise<ShareItemResult> {
  const share = loadShare();
  if (!share) return 'unavailable';
  const message = buildShareMessage(item);
  const photo = photoUri?.trim();
  if (photo) {
    try {
      await share.share({ message, url: photo });
      return 'shared';
    } catch {
      // Fall through to the text-only retry below.
    }
  }
  try {
    await share.share({ message });
    return 'text-only';
  } catch {
    return 'unavailable';
  }
}
