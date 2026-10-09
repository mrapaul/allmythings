/**
 * Inventory vocabulary attached to detect dispatches. The server accepts an
 * optional multipart `vocab` field (JSON string array) on POST /v1/detect and
 * the scout/detect-stream paths, and uses it to ground labels in what the
 * user actually owns ("that's a Chesterfield — you call yours 'sofa'").
 *
 * The vocabulary is supplied by a provider wired once in app/_layout.tsx
 * (where the Repo lives) and resolved AT DISPATCH TIME — the query is a
 * cheap single-column GROUP BY, so every dispatch sees inventory changes
 * immediately without any invalidation machinery. Everything is fail-open:
 * no provider or a failing provider means no vocab field, never a blocked
 * or slowed dispatch.
 */

/** The server caps the vocab field at 120 entries. */
export const DETECT_VOCAB_LIMIT = 120;

export type DetectVocabProvider = () => Promise<string[]>;

let provider: DetectVocabProvider | null = null;

/** Wired once at app startup; null clears (used by the cleanup). */
export function setDetectVocabProvider(next: DetectVocabProvider | null): void {
  provider = next;
}

/** Test seam — resets the module to its no-provider state. */
export function clearDetectVocabProvider(): void {
  provider = null;
}

/** Labels to guide the next detection, capped. Never rejects. */
export async function resolveDetectVocab(): Promise<string[]> {
  if (!provider) return [];
  try {
    const labels = await provider();
    return labels.slice(0, DETECT_VOCAB_LIMIT);
  } catch {
    return [];
  }
}

/**
 * The one place the `vocab` field is written. The field is OMITTED ENTIRELY
 * when the inventory has nothing to say — an empty array must not read as
 * "here is an empty vocabulary" server-side.
 */
export function appendDetectVocab(form: FormData, vocab: string[]): void {
  if (vocab.length === 0) return;
  form.append('vocab', JSON.stringify(vocab));
}
