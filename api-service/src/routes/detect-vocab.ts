/**
 * Parsing/validation for the optional multipart `vocab` field on the detect
 * routes: the owner's existing inventory names, used to prime the VLM prompt
 * ("prefer these names when they match").
 *
 * Two wire shapes are accepted:
 * - a JSON array of strings:        ["navy blue couch", "floor lamp"]
 * - a plain comma-separated string: navy blue couch, floor lamp
 *
 * Anything else is a 400 `invalid_body`: unparseable JSON, JSON that is not
 * an array, or non-string entries. Cleaning is silent by design: entries are
 * trimmed, empties dropped, each entry cut to VOCAB_MAX_ENTRY_CHARS, duplicates
 * collapsed case-insensitively (first casing wins), and the list truncated to
 * VOCAB_MAX_ENTRIES.
 */

/** Hard cap on priming entries; a longer list is silently truncated. */
export const VOCAB_MAX_ENTRIES = 120;
/** Per-entry cap after trimming; longer entries are silently cut. */
export const VOCAB_MAX_ENTRY_CHARS = 40;

export type DetectVocabResult =
  | { ok: true; vocab: string[] }
  | { ok: false; message: string };

export function parseDetectVocab(raw: string | undefined): DetectVocabResult {
  if (raw === undefined) return { ok: true, vocab: [] };
  const text = raw.trim();
  if (!text) return { ok: true, vocab: [] };

  let entries: unknown[];
  // A leading '[' means JSON mode strictly: the client clearly attempted an
  // array, so malformed JSON or a non-array is a 400 rather than a fallback.
  // Any other text that still parses as JSON (a bare string, object, or
  // number) was also meant as JSON and is rejected as a non-array; plain
  // comma-separated text does not parse and takes the other branch.
  if (text.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, message: 'vocab: invalid JSON (expected an array of strings)' };
    }
    if (!Array.isArray(parsed)) {
      return { ok: false, message: 'vocab: expected an array of strings' };
    }
    entries = parsed;
  } else {
    try {
      JSON.parse(text);
      // Valid JSON that is not an array (arrays start with '[').
      return { ok: false, message: 'vocab: expected an array of strings' };
    } catch {
      entries = text.split(',');
    }
  }

  const seen = new Set<string>();
  const vocab: string[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'string') {
      return { ok: false, message: 'vocab: entries must be strings' };
    }
    const cleaned = entry.trim().slice(0, VOCAB_MAX_ENTRY_CHARS);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    vocab.push(cleaned);
    if (vocab.length >= VOCAB_MAX_ENTRIES) break;
  }
  return { ok: true, vocab };
}
