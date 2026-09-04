// OPTIONAL embedding-based token equivalence for the eval matcher.
//
// OFF BY DEFAULT, and that is a deliberate choice, not an oversight:
//
//   * The harness produces the number `make eval-ci` gates on. A gate that
//     silently changes when a local Ollama is up, warm, or on a different model
//     revision is not a gate. The deterministic matcher in scoring.mjs is
//     reproducible offline and byte-stable across machines.
//   * The synonymy this domain actually needs is already in the answer key.
//     Oracle labels alternate with "/" ("dark navy couch / sofa",
//     "framed painting / artwork", "dark grey daybed / futon",
//     "wooden sideboard / cabinet"), and scoring.mjs treats each alternative as
//     an accepted surface form. Synonyms belong in the oracle, where a human
//     asserts them once and reviewers can see them, rather than in a similarity
//     threshold nobody can audit.
//   * A cosine cutoff is itself a tunable knob. Moving 0.84 moves recall, which
//     is precisely the kind of dial an accuracy gate should not expose.
//
// Enable with EVAL_SYNONYMS=embed to quantify what the deterministic matcher
// gives up. Requires nomic-embed-text:v1.5 on a local Ollama; when the daemon
// is unreachable the harness logs a warning and falls back to strict equality
// rather than failing or producing a different-but-silent number.

import fs from 'node:fs/promises';
import path from 'node:path';

const EVAL_ROOT = path.dirname(new URL(import.meta.url).pathname);
const CACHE_PATH = path.join(EVAL_ROOT, '.embed-cache.json');
const OLLAMA = process.env.OLLAMA_EMBED_URL ?? 'http://127.0.0.1:11434';
const MODEL = process.env.EVAL_EMBED_MODEL ?? 'nomic-embed-text:v1.5';

/** Cosine floor for "these two words name the same thing". */
export const SYNONYM_COSINE = Number(process.env.EVAL_SYNONYM_COSINE ?? 0.84);

const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na > 0 && nb > 0 ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
};

async function loadCache() {
  try { return JSON.parse(await fs.readFile(CACHE_PATH, 'utf-8')); } catch { return {}; }
}

async function embed(tokens) {
  const res = await fetch(`${OLLAMA}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input: tokens }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`ollama /api/embed ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.embeddings)) throw new Error('ollama returned no embeddings');
  return data.embeddings;
}

/**
 * Build a `tokenEq(a, b)` for scoring.mjs over a known token universe.
 * Returns null (caller keeps strict equality) when embeddings are disabled or
 * unavailable.
 */
export async function buildTokenEq(tokens, { enabled = process.env.EVAL_SYNONYMS === 'embed' } = {}) {
  if (!enabled) return null;
  const vocab = [...new Set(tokens)].filter(Boolean).sort();
  const cache = await loadCache();
  const missing = vocab.filter((t) => !cache[t]);
  if (missing.length > 0) {
    try {
      const vectors = await embed(missing);
      missing.forEach((t, i) => { cache[t] = vectors[i]; });
      await fs.writeFile(CACHE_PATH, JSON.stringify(cache));
    } catch (e) {
      console.warn(`[eval] embeddings unavailable (${e.message}); falling back to strict token equality`);
      return null;
    }
  }
  const memo = new Map();
  return (a, b) => {
    if (a === b) return true;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (memo.has(key)) return memo.get(key);
    const va = cache[a];
    const vb = cache[b];
    const eq = Boolean(va && vb) && cosine(va, vb) >= SYNONYM_COSINE;
    memo.set(key, eq);
    return eq;
  };
}

/** Every content token appearing in a set of oracles plus a set of runs. */
export function tokenUniverse(parseLabel, labels) {
  const all = new Set();
  for (const l of labels) for (const t of parseLabel(l).content) all.add(t);
  return [...all];
}
