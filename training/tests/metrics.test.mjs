// node --test training/tests
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aggregate, duplicateRate, extractJson, labelsMatch, markdownTable, scoreFixture,
} from '../benchmarks/metrics.mjs';

const ORACLE = {
  expected_items: [{ label: 'navy blue couch' }, { label: 'brass floor lamp' }, { label: 'area rug' }],
  min_item_count: 3,
  max_item_count: 6,
};

test('extractJson tolerates fences, prose and control chars', () => {
  assert.deepEqual(extractJson('```json\n[{"label":"sofa"}]\n```'), [{ label: 'sofa' }]);
  assert.deepEqual(extractJson('Here you go: [{"label":"sofa"}] done'), [{ label: 'sofa' }]);
  assert.deepEqual(extractJson(''), []);
  assert.deepEqual(extractJson('not json'), []);
  assert.deepEqual(extractJson('[{"label":"bad"'), []);
});

test('labelsMatch keeps harness semantics: token overlap, tokens >2 chars', () => {
  assert.equal(labelsMatch('navy blue couch', 'navy blue couch'), true);
  assert.equal(labelsMatch('blue couch', 'navy blue couch'), true);
  assert.equal(labelsMatch('COUCH, navy', 'navy blue couch'), true);
  assert.equal(labelsMatch('lamp', 'navy blue couch'), false);
  // Short tokens (<=2 chars) must not create a match.
  assert.equal(labelsMatch('tv on stand', 'tv'), false);
});

test('scoreFixture computes recall with one-oracle-item-per-candidate matching', () => {
  const s = scoreFixture(
    [{ label: 'navy blue couch' }, { label: 'brass floor lamp' }, { label: 'unrelated widget' }],
    ORACLE,
  );
  assert.equal(s.recall, 66.7);
  assert.equal(s.matchedCount, 2);
  assert.deepEqual(s.missed, ['area rug']);
  assert.equal(s.itemCount, 3);
  assert.equal(s.countWithinRange, true);
  assert.equal(s.countError, 0);
});

test('scoreFixture reports count error outside the oracle range', () => {
  const under = scoreFixture([{ label: 'area rug' }], ORACLE);
  assert.equal(under.countWithinRange, false);
  assert.equal(under.countError, 2);

  const over = scoreFixture(Array.from({ length: 9 }, (_, i) => ({ label: `thing ${i}` })), ORACLE);
  assert.equal(over.countWithinRange, false);
  assert.equal(over.countError, 3);
});

test('duplicateRate measures same-label multiplicity', () => {
  assert.equal(duplicateRate([]), 0);
  assert.equal(duplicateRate([{ label: 'vase' }, { label: 'lamp' }]), 0);
  assert.equal(duplicateRate([{ label: 'vase' }, { label: 'Vase' }]), 0.5);
  assert.equal(duplicateRate([{ label: 'a' }, { label: 'a' }, { label: 'a' }, { label: 'b' }]), 0.5);
});

test('aggregate ignores failed fixtures but counts them', () => {
  const agg = aggregate([
    { recall: 100, itemCount: 4, countWithinRange: true, countError: 0, duplicateRate: 0, elapsedMs: 1000 },
    { recall: 50, itemCount: 9, countWithinRange: false, countError: 3, duplicateRate: 0.2, elapsedMs: 3000 },
    { fixture: 'x', error: 'HTTP 500', elapsedMs: 10 },
  ]);
  assert.equal(agg.avgRecall, 75);
  assert.equal(agg.avgItems, 6.5);
  assert.equal(agg.countAccuracy, 50);
  assert.equal(agg.avgCountError, 1.5);
  assert.equal(agg.avgDuplicateRate, 0.1);
  assert.equal(agg.avgLatencyMs, 2000);
  assert.equal(agg.failures, 1);
  assert.equal(agg.n, 3);
});

test('markdownTable ranks by recall, lists skips and flags reference-only rows', () => {
  const mk = (name, recall, referenceOnly = false) => ({
    name, license: 'X', deployment: 'Y', referenceOnly,
    aggregate: {
      avgRecall: recall, avgItems: 5, countAccuracy: 100, avgCountError: 0,
      avgDuplicateRate: 0, avgLatencyMs: 10, recallPerSecond: recall / 0.01,
      failures: 0, n: 1,
    },
  });
  const md = markdownTable([mk('low', 50), mk('high', 90), mk('ref', 70, true)], [
    { name: 'gemini-2.5-flash', reason: 'GEMINI_API_KEY not set' },
  ]);
  const order = ['high', 'ref', 'low'].map((n) => md.indexOf(`| ${n} |`));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.match(md, /Skipped contenders/);
  assert.match(md, /GEMINI_API_KEY not set/);
  assert.match(md, /REFERENCE ONLY \(not shippable\): ref/);
});


test('aggregate reports recall per second for the latency/accuracy tradeoff', () => {
  const agg = aggregate([
    { recall: 90, itemCount: 10, countWithinRange: true, countError: 0, duplicateRate: 0, elapsedMs: 15_000 },
  ]);
  assert.equal(agg.avgLatencyMs, 15_000);
  assert.equal(agg.recallPerSecond, 6);
  // Pipeline-style: same recall, 10x slower -> 10x worse recall/s.
  const slow = aggregate([
    { recall: 90, itemCount: 10, countWithinRange: true, countError: 0, duplicateRate: 0, elapsedMs: 150_000 },
  ]);
  assert.equal(slow.recallPerSecond, 0.6);
});

test('aggregate handles zero-latency without dividing by zero', () => {
  const agg = aggregate([
    { recall: 50, itemCount: 1, countWithinRange: true, countError: 0, duplicateRate: 0, elapsedMs: 0 },
  ]);
  assert.equal(agg.recallPerSecond, 0);
});

test('markdownTable emits the pipeline-collapse check from the four configs', () => {
  const md = markdownTable([
    {
      name: 'candidate:x', config: 'candidate-raw', license: 'A', deployment: 'B',
      aggregate: {
        avgRecall: 92, avgItems: 12, countAccuracy: 88, avgCountError: 0,
        avgDuplicateRate: 0.02, avgLatencyMs: 15_000, recallPerSecond: 6.13, failures: 0, n: 8,
      },
    },
    {
      name: 'api:pipeline[base]', config: 'base-pipeline', license: 'C', deployment: 'D',
      aggregate: {
        avgRecall: 96.1, avgItems: 31, countAccuracy: 100, avgCountError: 0,
        avgDuplicateRate: 0.05, avgLatencyMs: 125_000, recallPerSecond: 0.77, failures: 0, n: 8,
      },
    },
  ]);
  assert.match(md, /Pipeline collapse check/);
  assert.match(md, /candidate single-call recall: 92%/);
  assert.match(md, /speedup vs incumbent pipeline: 8\.3x/);
  assert.match(md, /Recall\/s/);
});
