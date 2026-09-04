// Eval scoring: honest oracle<->candidate label matching.
//
// WHY THIS EXISTS
// ---------------
// The original matcher counted an oracle item as found when it shared ANY
// normalized token longer than 2 characters with ANY candidate label, taking
// the FIRST match in iteration order. Two consequences made recall measure
// label verbosity rather than detection quality:
//
//   1. Function words scored. "with" and "white" are >2 chars, so
//      "vase with flowers" matched "shelf with books", and any two labels
//      naming the same colour matched regardless of what the object was.
//   2. Head nouns were ignored. "black planter" was credited against the
//      oracle's "two-tone ceramic planter" purely on "planter"; conversely a
//      wrong-object candidate that happened to share a modifier ("gold wire
//      side table" vs "gold wire plant stand") consumed an oracle slot the
//      right candidate needed, and the greedy first-match loop then scored a
//      genuinely detected item as missed.
//
// The matcher below is deliberately vocabulary-free: it uses closed-class
// English grammar (function words, prepositions) and the answer key's own
// structured fields. It never hardcodes object names, synonyms or categories.
//
// Zero dependencies, Node built-ins only.

/**
 * Closed-class English function words. These carry no object identity, so they
 * can never create a match on their own. Grammar, not a domain vocabulary:
 * this list is complete for English and never needs maintaining as the world
 * of home objects changes.
 */
export const STOPWORDS = new Set([
  // articles / determiners
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'its', 'it', 'their', 'his', 'her',
  'some', 'any', 'each', 'every', 'both', 'either', 'neither', 'no',
  // coordinating / subordinating conjunctions
  'and', 'or', 'nor', 'but', 'so', 'yet', 'if', 'than', 'as', 'while', 'because',
  // prepositions
  'of', 'in', 'on', 'at', 'to', 'for', 'with', 'without', 'from', 'by', 'into', 'onto',
  'upon', 'over', 'under', 'underneath', 'beneath', 'above', 'below', 'behind', 'beside',
  'between', 'among', 'against', 'near', 'atop', 'along', 'across', 'through', 'inside',
  'outside', 'around', 'about', 'off', 'out', 'up', 'down', 'per', 'via',
  // copulas / auxiliaries
  'is', 'are', 'was', 'were', 'be', 'being', 'been',
]);

/**
 * The subset of function words that TERMINATE a head noun phrase: a trailing
 * prepositional phrase ("mirror on wall") or participial clause ("vase holding
 * branches") modifies the head, it does not replace it. Mirrors
 * HEAD_PHRASE_BREAKERS in api-service/src/services/vlm-detector.parse.ts so the
 * harness and the production deduper agree on what a head noun is.
 *
 * Participles like "mounted"/"hanging" are deliberately absent — "wall mounted
 * tv" heads at "tv".
 */
export const HEAD_PHRASE_BREAKERS = new Set([
  'on', 'in', 'at', 'of', 'with', 'above', 'over', 'under', 'underneath', 'beneath',
  'behind', 'beside', 'near', 'against', 'atop', 'along', 'inside', 'around',
  'wearing', 'holding', 'carrying', 'standing', 'sitting',
]);

/**
 * Light plural stem so "chairs"/"chair" and "vases"/"vase" are one token.
 * Deliberately conservative: never touches -ss ("glass") or -us, and only
 * applies from 4 characters up.
 */
export function stem(token) {
  if (token.length < 4 || !token.endsWith('s')) return token;
  if (token.endsWith('ss') || token.endsWith('us') || token.endsWith('is')) return token;
  return token.slice(0, -1);
}

/**
 * Tokenize a label into `{ t, spaced }` records. `spaced` marks tokens that
 * were whitespace-separated in the original string. Sub-tokens produced by
 * splitting a hyphenated/punctuated compound are `spaced: false`, because a
 * function word INSIDE a compound is part of the word, not a phrase boundary:
 * "built-in oven" heads at "oven", not at "built".
 */
export function tokenize(label) {
  const out = [];
  for (const word of String(label ?? '').toLowerCase().split(/\s+/)) {
    if (!word) continue;
    const parts = word.split(/[^a-z0-9]+/).filter(Boolean);
    parts.forEach((p, i) => out.push({ t: stem(p), spaced: i === 0 }));
  }
  return out;
}

/** Tokens up to the first whitespace-separated head-phrase breaker. */
function headPhrase(tokens) {
  const idx = tokens.findIndex((x) => x.spaced && HEAD_PHRASE_BREAKERS.has(x.t));
  return idx === -1 ? tokens : tokens.slice(0, idx);
}

const contentOf = (tokens) => tokens.filter((x) => !STOPWORDS.has(x.t)).map((x) => x.t);

/**
 * Parse a label into the shape the matcher compares:
 * - `head`     the last content token of the head noun phrase (English noun
 *              phrases are head-final), or null when the label is all function
 *              words.
 * - `content`  every content token in the label, including any trailing
 *              prepositional phrase — "vase with branches" keeps "branches" so
 *              it can agree with the oracle's "glass vase with flowering
 *              branches".
 * - `modifiers` content tokens other than the head: the distinguishing
 *              material/colour/shape/purpose words.
 */
export function parseLabel(label) {
  const tokens = tokenize(label);
  const content = contentOf(tokens);
  const hp = contentOf(headPhrase(tokens));
  const head = hp.length > 0 ? hp[hp.length - 1] : (content.length > 0 ? content[content.length - 1] : null);
  const modifiers = content.filter((t) => t !== head);
  return { label: String(label ?? ''), head, content, modifiers };
}

/**
 * Expand one oracle label into the surface forms it licenses, using notation
 * the answer key already uses — no synonym list is invented here:
 * - `"dark navy couch / sofa"` -> "dark navy couch", "sofa"
 * - `"snake plant (sansevieria) large"` -> "snake plant large", "sansevieria"
 * A bare alternative like "sofa" has no modifiers, so head agreement alone
 * satisfies it: this is how genuine synonymy enters the matcher.
 */
export function labelVariants(label) {
  const variants = [];
  for (const part of String(label ?? '').split('/')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const stripped = trimmed.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (stripped) variants.push(stripped);
    for (const m of trimmed.matchAll(/\(([^)]*)\)/g)) {
      const alias = m[1].trim();
      if (alias) variants.push(alias);
    }
  }
  return variants.length > 0 ? variants : [String(label ?? '')];
}

/**
 * Detect POSTFIX DISAMBIGUATORS structurally instead of with a size vocabulary.
 * When two oracle entries in the same fixture differ only in their final token
 * ("snake plant large" / "snake plant small"), that final token is the author
 * separating two instances of one object type — it is not the head noun. Both
 * entries therefore also accept the shared prefix ("snake plant"), while the
 * disambiguator stays in `modifiers` so the assignment step still prefers the
 * candidate that names it.
 */
function disambiguatorPrefixes(variantLists) {
  const seen = new Map();
  for (const list of variantLists) {
    for (const v of list) {
      const toks = contentOf(tokenize(v));
      if (toks.length < 2) continue;
      const key = toks.slice(0, -1).join(' ');
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}

const tokenizeColours = (colors) =>
  new Set((Array.isArray(colors) ? colors : []).flatMap((c) => contentOf(tokenize(c))));

/** Every colour word the answer key itself uses. Derived from data, not typed out. */
export function buildColourLexicon(oracles) {
  const lex = new Set();
  for (const oracle of oracles) {
    for (const item of oracle?.expected_items ?? []) {
      for (const t of tokenizeColours(item.colors)) lex.add(t);
    }
  }
  return lex;
}

/**
 * Compile an oracle file into matchable specs. Each expected item becomes one
 * or more variant specs plus the colour set the answer key asserts for it.
 */
export function compileOracle(oracle, colourLexicon) {
  const items = oracle.expected_items ?? [];
  const variantLists = items.map((it) => labelVariants(it.label));
  const prefixes = disambiguatorPrefixes(variantLists);

  return items.map((item, i) => {
    const specs = [];
    const pushed = new Set();
    const push = (text) => {
      const spec = parseLabel(text);
      const key = `${spec.head}|${spec.content.join(' ')}`;
      if (spec.head && !pushed.has(key)) { pushed.add(key); specs.push(spec); }
    };
    for (const v of variantLists[i]) {
      push(v);
      const toks = contentOf(tokenize(v));
      if (toks.length >= 2 && prefixes.has(toks.slice(0, -1).join(' '))) push(toks.slice(0, -1).join(' '));
    }
    const declared = tokenizeColours(item.colors);
    const fromLabel = new Set(specs.flatMap((s) => s.content).filter((t) => colourLexicon.has(t)));
    return {
      index: i,
      label: item.label,
      specs,
      colours: new Set([...declared, ...fromLabel]),
    };
  });
}

/** Default token equality: exact match after stemming. */
const strictEq = (a, b) => a === b;

/**
 * Score one oracle variant against one candidate.
 * Returns 0 when they do not match, or a positive weight used only to decide
 * WHICH of several valid pairings to report (higher = better evidence).
 *
 * Rules, in order:
 *  1. HEAD AGREEMENT (required). English noun phrases are head-final, so the
 *     head noun is what the label is a name FOR. "gold wire side table" and
 *     "gold wire plant stand" share two modifiers and no head: different
 *     objects, no match.
 *  2. MODIFIER AGREEMENT, REQUIRED ONLY TO DISAMBIGUATE. When two or more
 *     expected items in the same fixture share a head noun (five plants, two
 *     side tables), naming the head noun is not evidence you found a
 *     PARTICULAR one, so the candidate must reproduce at least one of the
 *     oracle entry's distinguishing modifiers. When the head noun picks out
 *     exactly one expected item, there is nothing to disambiguate and head
 *     agreement is sufficient.
 *
 *     Requiring a modifier unconditionally was measured and rejected: it turns
 *     the old defect inside out. The old matcher rewarded verbose labels
 *     (more tokens, more chances to collide); an unconditional modifier rule
 *     penalises terse ones, marking "television", "rug" and "cabinet" as
 *     misses in a scene containing exactly one of each. Both make recall a
 *     function of label style rather than of detection.
 *
 *  3. COLOUR CONFLICT VETO. When the candidate asserts a colour, the answer key
 *     asserts colours for the entry, the two are disjoint, and nothing but a
 *     colour agreed, the candidate is describing a different object of the same
 *     type: "blue patterned rug" is not the oracle's "white area rug". Colours
 *     come from the oracle's own `colors` field, and the lexicon of what counts
 *     as a colour word is derived from that same field, so no colour list is
 *     hardcoded.
 *
 *     The veto stands down when a non-colour modifier agrees. Detector colour
 *     naming is unreliable across boundaries the answer key itself straddles
 *     ("tan"/"brown", "navy"/"dark blue", "black"/"dark grey"), so colour
 *     disagreement is weak evidence of a different object while agreement on
 *     material or purpose ("leather ... office chair") is strong evidence of
 *     the same one. Measured: the key lists the office chair as
 *     `colors: ["tan"]` in one fixture and `["tan","brown"]` in another, so an
 *     unconditional veto scored "brown leather office chair" differently on the
 *     same physical chair depending on the fixture.
 *
 * Colours never GRANT modifier agreement under rule 2. Letting a bare colour
 * word disambiguate would reintroduce the "any shared adjective scores" defect
 * this matcher exists to remove.
 */
export function pairScore(oracleSpec, oracleColours, cand, colourLexicon, tokenEq = strictEq, requireModifier = true) {
  if (!oracleSpec.head || !cand.head) return 0;
  if (!tokenEq(oracleSpec.head, cand.head)) return 0;

  const shared = oracleSpec.modifiers.filter((m) => cand.content.some((c) => tokenEq(m, c)));
  if (requireModifier && oracleSpec.modifiers.length > 0 && shared.length === 0) return 0;

  const candColours = cand.content.filter((t) => colourLexicon.has(t));
  const colourConflict =
    candColours.length > 0 &&
    oracleColours.size > 0 &&
    !candColours.some((c) => [...oracleColours].some((o) => tokenEq(o, c)));
  if (colourConflict && !shared.some((t) => !colourLexicon.has(t))) return 0;

  const exact = oracleSpec.content.length === cand.content.length && shared.length === oracleSpec.modifiers.length;
  return 1 + 2 * shared.length + (exact ? 1 : 0);
}

/** Best-scoring variant of an oracle entry against one candidate. */
export function entryScore(entry, cand, colourLexicon, tokenEq = strictEq, requireModifier = true) {
  let best = 0;
  for (const spec of entry.specs) {
    const s = pairScore(spec, entry.colours, cand, colourLexicon, tokenEq, requireModifier);
    if (s > best) best = s;
  }
  return best;
}

/**
 * Head nouns claimed by two or more expected items in this fixture. A candidate
 * naming one of these must disambiguate; a candidate naming any other head noun
 * cannot be confused with a sibling entry.
 */
export function ambiguousHeads(entries, tokenEq = strictEq) {
  const heads = entries.map((e) => [...new Set(e.specs.map((s) => s.head).filter(Boolean))]);
  const ambiguous = new Set();
  for (let i = 0; i < heads.length; i++) {
    for (let j = i + 1; j < heads.length; j++) {
      for (const a of heads[i]) {
        for (const b of heads[j]) if (tokenEq(a, b)) { ambiguous.add(a); ambiguous.add(b); }
      }
    }
  }
  return ambiguous;
}

/**
 * Maximum-cardinality bipartite matching (Kuhn's augmenting-path algorithm).
 *
 * WHY MAXIMUM AND NOT GREEDY-OVER-SORTED-SCORES: recall counts how many oracle
 * entries were found, so the honest number is the largest set of entries that
 * CAN be simultaneously explained by distinct candidates. Greedy over sorted
 * scores is order-dependent and can still starve an entry whose only candidate
 * was spent elsewhere — the exact failure being fixed. Kuhn's is ~30 lines,
 * has no dependencies, and at these sizes (<=20 entries x <=60 candidates) is
 * instant. Adjacency is pre-sorted by descending score and the matching is
 * seeded greedily, so among all maximum matchings the reported pairing is the
 * best-evidenced one and is deterministic.
 */
export function maximumMatching(adjacency, nOracle, nCand, seedPairs = []) {
  const oracleTo = new Array(nOracle).fill(-1);
  const candTo = new Array(nCand).fill(-1);
  for (const [o, c] of seedPairs) {
    if (oracleTo[o] === -1 && candTo[c] === -1) { oracleTo[o] = c; candTo[c] = o; }
  }
  const augment = (o, visited) => {
    for (const c of adjacency[o]) {
      if (visited.has(c)) continue;
      visited.add(c);
      if (candTo[c] === -1 || augment(candTo[c], visited)) {
        candTo[c] = o;
        oracleTo[o] = c;
        return true;
      }
    }
    return false;
  };
  for (let o = 0; o < nOracle; o++) if (oracleTo[o] === -1) augment(o, new Set());
  return oracleTo;
}

/**
 * Match candidates to oracle entries. Returns `{ oracleTo, pairs }` where
 * `oracleTo[i]` is the candidate index assigned to expected item `i`, or -1.
 */
export function matchItems(extracted, oracle, opts = {}) {
  const colourLexicon = opts.colourLexicon ?? buildColourLexicon([oracle]);
  const tokenEq = opts.tokenEq ?? strictEq;
  const entries = compileOracle(oracle, colourLexicon);
  const cands = extracted.map((c) => parseLabel(c?.label ?? ''));
  const ambiguous = ambiguousHeads(entries, tokenEq);

  const scores = entries.map((e) => {
    const needsModifier = e.specs.some((s) => ambiguous.has(s.head));
    return cands.map((c) => entryScore(e, c, colourLexicon, tokenEq, needsModifier));
  });
  const adjacency = scores.map((row) =>
    row
      .map((s, j) => [s, j])
      .filter(([s]) => s > 0)
      .sort((a, b) => b[0] - a[0] || a[1] - b[1])
      .map(([, j]) => j),
  );

  const seed = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = 0; j < cands.length; j++) if (scores[i][j] > 0) seed.push([i, j, scores[i][j]]);
  }
  seed.sort((a, b) => b[2] - a[2] || a[0] - b[0] || a[1] - b[1]);

  const oracleTo = maximumMatching(adjacency, entries.length, cands.length, seed.map(([i, j]) => [i, j]));
  const pairs = oracleTo
    .map((j, i) => (j === -1 ? null : { oracle: entries[i].label, candidate: extracted[j]?.label ?? '', score: scores[i][j] }))
    .filter(Boolean);
  return { oracleTo, pairs };
}

/**
 * Score one run. Recall keeps its original definition — matched oracle entries
 * divided by total oracle entries — and the returned object keeps the exact
 * key set the harness and existing run/report files already use.
 */
export function scoreRun(extracted, oracle, opts = {}) {
  const expected = oracle.expected_items ?? [];
  const { oracleTo } = matchItems(extracted, oracle, opts);
  const matchedCount = oracleTo.filter((j) => j !== -1).length;
  const recall = expected.length > 0 ? matchedCount / expected.length : 0;
  return {
    recall: +(recall * 100).toFixed(1),
    itemCount: extracted.length,
    expectedMin: oracle.min_item_count,
    expectedMax: oracle.max_item_count,
    countWithinRange: extracted.length >= oracle.min_item_count && extracted.length <= oracle.max_item_count,
    matchedCount,
    missed: expected.filter((_, i) => oracleTo[i] === -1).map((e) => e.label),
  };
}
