// Matcher unit tests. Run: node --test eval/
//
// Every case below is drawn from a real oracle entry in eval/oracle/ and a real
// candidate label in eval/runs/, so the tests pin the behaviour that actually
// moved historical numbers rather than invented strings.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildColourLexicon, matchItems, parseLabel, scoreRun } from './scoring.mjs';

// The colour lexicon is global across the answer key in the harness, so the
// tests derive it from the real eval/oracle/*.json rather than from the small
// fixtures below.
const ORACLE_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'oracle');
const COLOUR_LEXICON = buildColourLexicon(
  fs.readdirSync(ORACLE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(ORACLE_DIR, f), 'utf-8'))),
);

/**
 * The matcher this file replaced, kept verbatim so the defect it had is
 * demonstrated by execution rather than by assertion in a comment.
 * Original: eval/harness.mjs, `labelsMatch` + `scoreRun` (pre-fix).
 */
function legacyMatchedCount(extracted, oracle) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const labelsMatch = (candidate, expected) => {
    const c = new Set(norm(candidate));
    return [...new Set(norm(expected))].filter((t) => c.has(t) && t.length > 2).length >= 1;
  };
  const matched = new Set();
  for (const cand of extracted) {
    for (let i = 0; i < oracle.expected_items.length; i++) {
      if (matched.has(i)) continue;
      if (labelsMatch(cand.label ?? '', oracle.expected_items[i].label)) { matched.add(i); break; }
    }
  }
  return matched.size;
}

const oracleOf = (items) => ({
  expected_items: items,
  min_item_count: 1,
  max_item_count: 99,
});
const items = (labels) => labels.map((l) => (typeof l === 'string' ? { label: l, colors: [] } : l));
const cands = (labels) => labels.map((label) => ({ label }));

function score(candLabels, oracle) {
  return scoreRun(cands(candLabels), oracle, { colourLexicon: COLOUR_LEXICON });
}

test('stopword-only overlap does not match: "with" cannot credit an item', () => {
  // eval/oracle/bedroom_01.json + a real bedroom_01 candidate label.
  const oracle = oracleOf(items([{ label: 'floor lamp with grey shade', colors: ['grey'] }]));
  const candidates = cands(['framed painting with gold frame']);

  assert.equal(legacyMatchedCount(candidates, oracle), 1, 'legacy matcher credited the item on "with" alone');
  assert.equal(score(['framed painting with gold frame'], oracle).matchedCount, 0);
});

test('a shared colour word alone does not match: "white" cannot credit an item', () => {
  const oracle = oracleOf(items([{ label: 'white area rug', colors: ['white', 'cream'] }]));
  const candidates = cands(['white ceramic planter']);

  assert.equal(legacyMatchedCount(candidates, oracle), 1, 'legacy matcher credited the rug on "white" alone');
  assert.equal(score(['white ceramic planter'], oracle).matchedCount, 0);
});

test('colour conflict blocks a match: "blue patterned rug" is not the white area rug', () => {
  // Real pair: eval/oracle/1776173015803.json vs api:embed-classify2 run.
  const oracle = oracleOf(items([{ label: 'white area rug', colors: ['white', 'cream'] }]));
  assert.equal(score(['blue patterned rug'], oracle).matchedCount, 0);
});

test('colour conflict blocks a match: "sheer white curtains" are not the grey curtains', () => {
  // Real pair: eval/oracle/bedroom_01.json vs api:precision-r2 run.
  const oracle = oracleOf(items([{ label: 'grey curtains', colors: ['grey'] }]));
  assert.equal(score(['sheer white curtains'], oracle).matchedCount, 0);
});

test('colour conflict blocks a match: a green planter is not the two-tone ceramic planter', () => {
  const oracle = oracleOf(items([{ label: 'two-tone ceramic planter', colors: ['black', 'cream'] }]));
  assert.equal(score(['green planter'], oracle).matchedCount, 0);
});

test('a colour disagreement does NOT block when material or purpose agrees', () => {
  // eval/oracle/1776175427607.json declares colors ["tan"] for this chair and
  // eval/oracle/1776173015803.json declares ["tan","brown"] for the same
  // physical chair. An unconditional colour veto would score the identical
  // candidate differently per fixture; agreement on "leather"/"office" is the
  // stronger evidence and wins.
  const oracle = oracleOf(items([{ label: 'tan leather cane-back office chair', colors: ['tan'] }]));
  assert.equal(score(['brown leather office chair'], oracle).matchedCount, 1);
});

test('head nouns must agree: "gold wire side table" is not the gold wire plant stand', () => {
  // Real pair: eval/oracle/1776175427607.json vs api:precision-r2 run. Two
  // modifiers agree and the object is different, which is exactly why modifier
  // overlap alone cannot be the match rule.
  const oracle = oracleOf(items([{ label: 'gold wire plant stand', colors: ['gold'] }]));

  assert.equal(legacyMatchedCount(cands(['gold wire side table']), oracle), 1, 'legacy matcher credited the stand');
  assert.equal(score(['gold wire side table'], oracle).matchedCount, 0);
});

test('greedy starvation is fixed: a candidate is never spent on the wrong entry', () => {
  // Real 1776175427607 shape: the wrong-headed "gold wire side table" appears
  // BEFORE the exact "gold wire plant stand" in the model's output. The old
  // first-match loop let it consume the plant-stand slot, after which the exact
  // candidate had nothing left to match and a genuinely detected item scored as
  // missed.
  const oracle = oracleOf(items([
    { label: 'gold wire plant stand', colors: ['gold'] },
    { label: 'wooden side table', colors: ['brown'] },
  ]));
  const candidates = ['gold wire side table', 'gold wire plant stand'];

  assert.equal(legacyMatchedCount(cands(candidates), oracle), 1, 'legacy matcher starved one entry');
  assert.equal(score(candidates, oracle).matchedCount, 2);
});

test('maximum matching beats greedy-over-sorted-scores', () => {
  // "white ceramic planter" is the highest-scoring pair for BOTH entries.
  // Taking it greedily for the planter leaves the mug unmatched unless the
  // matching augments; maximum-cardinality matching finds both.
  const oracle = oracleOf(items([
    { label: 'two-tone ceramic planter', colors: ['black', 'cream'] },
    { label: 'white ceramic mug', colors: ['white'] },
  ]));
  const result = score(['white ceramic planter', 'white ceramic mug'], oracle);
  assert.equal(result.matchedCount, 2);
});

test('true synonyms match through the answer key\'s own "/" alternation', () => {
  // eval/oracle/1776173015803.json: "dark navy couch / sofa". The bare
  // alternative carries no modifiers, so head agreement alone satisfies it.
  const oracle = oracleOf(items([{ label: 'dark navy couch / sofa', colors: ['navy', 'dark blue'] }]));
  assert.equal(score(['gray sofa'], oracle).matchedCount, 1);
  assert.equal(score(['navy blue couch'], oracle).matchedCount, 1);

  const cabinet = oracleOf(items([{ label: 'wooden sideboard / cabinet', colors: ['brown'] }]));
  assert.equal(score(['cabinet'], cabinet).matchedCount, 1);
});

test('a parenthetical alias in the answer key is an accepted surface form', () => {
  const oracle = oracleOf(items([
    { label: 'snake plant (sansevieria) large', colors: ['green'] },
    { label: 'snake plant small', colors: ['green'] },
  ]));
  assert.equal(score(['sansevieria'], oracle).matchedCount, 1);
  // "large"/"small" are recognised as postfix disambiguators because two
  // entries differ only in that final token, so "snake plant" heads at "plant"
  // and credits one of them.
  assert.equal(score(['snake plant'], oracle).matchedCount, 1);
});

test('an unambiguous head noun does not require a modifier', () => {
  // eval/oracle/mockup_living_01.json. The scene contains exactly one
  // television and one rug, so a terse label is a correct detection.
  const oracle = oracleOf(items([
    { label: 'wall-mounted television', colors: ['black'] },
    { label: 'gray fringed area rug', colors: ['grey'] },
  ]));
  assert.equal(score(['television', 'rug'], oracle).matchedCount, 2);
});

test('an ambiguous head noun does require a modifier', () => {
  // eval/oracle/1776175427607.json has two snake plants; "potted plant" cannot
  // decide which, so it credits neither.
  const oracle = oracleOf(items([
    { label: 'snake plant (sansevieria) large', colors: ['green'] },
    { label: 'snake plant small', colors: ['green'] },
  ]));
  assert.equal(score(['potted plant', 'green plant in pot'], oracle).matchedCount, 0);
  assert.equal(score(['large snake plant', 'small snake plant'], oracle).matchedCount, 2);
});

test('one candidate credits at most one oracle entry', () => {
  const oracle = oracleOf(items([
    { label: 'snake plant (sansevieria) large', colors: ['green'] },
    { label: 'snake plant small', colors: ['green'] },
  ]));
  assert.equal(score(['snake plant'], oracle).matchedCount, 1);
});

test('documents: "black planter" DOES credit the two-tone ceramic planter', () => {
  // eval/oracle/1776173015803.json declares
  //   { "label": "two-tone ceramic planter", "colors": ["black", "cream"] }
  // so "black" is a truthful description of that planter and there is exactly
  // one planter in the scene. This pair was reported as a false credit, but on
  // the answer key's own evidence it is a correct one: the old matcher's fault
  // in this fixture was that ANY token sufficed, not that "planter" did.
  const oracle = oracleOf(items([{ label: 'two-tone ceramic planter', colors: ['black', 'cream'] }]));
  assert.equal(score(['black planter'], oracle).matchedCount, 1);
});

test('a richer candidate wins the reported pairing over a bare one', () => {
  const oracle = oracleOf(items([{ label: 'two-tone ceramic planter', colors: ['black', 'cream'] }]));
  const { pairs } = matchItems(cands(['black planter', 'white ceramic planter']), oracle, {
    colourLexicon: COLOUR_LEXICON,
  });
  assert.equal(pairs[0].candidate, 'white ceramic planter');
});

test('a function word inside a compound does not end the head phrase', () => {
  // "built-in oven" heads at "oven", not at "built".
  assert.equal(parseLabel('built-in oven').head, 'oven');
  assert.equal(parseLabel('wall-mounted television').head, 'television');
  // A whitespace-separated preposition still ends it.
  assert.equal(parseLabel('books on shelves').head, 'book');
  assert.equal(parseLabel('potted plant in dark pot on rug').head, 'plant');
});

test('plurals are one token with their singular', () => {
  assert.equal(parseLabel('red throw pillows').head, parseLabel('red throw pillow').head);
  assert.equal(parseLabel('glass vase').head, 'glass vase'.split(' ')[1]);
  assert.equal(parseLabel('glass').head, 'glass', 'never stems -ss');
});

test('recall keeps its definition and the run-file shape is unchanged', () => {
  const oracle = {
    expected_items: items([
      { label: 'red armchair', colors: ['red'] },
      { label: 'brass floor lamp', colors: ['gold', 'brass'] },
      { label: 'laptop computer', colors: ['black'] },
    ]),
    min_item_count: 2,
    max_item_count: 4,
  };
  const result = score(['red armchair', 'brass floor lamp'], oracle);
  assert.deepEqual(Object.keys(result).sort(), [
    'countWithinRange', 'expectedMax', 'expectedMin', 'itemCount', 'matchedCount', 'missed', 'recall',
  ]);
  assert.equal(result.matchedCount, 2);
  assert.equal(result.recall, 66.7);
  assert.equal(result.itemCount, 2);
  assert.equal(result.countWithinRange, true);
  assert.deepEqual(result.missed, ['laptop computer']);
});

test('an empty candidate list scores zero without throwing', () => {
  const oracle = oracleOf(items(['red armchair']));
  assert.equal(score([], oracle).recall, 0);
});
