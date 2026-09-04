// node --test training/tests
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COLLAPSE_MIN_SPEEDUP, COLLAPSE_RECALL_FLOOR, DEFAULT_RECALL_FLOOR,
  activeEntry, addEntry, evaluateGate, nextVersion, renderModelCard, rollback,
} from '../release/gate.mjs';

// Incumbent: base model inside the full pipeline — 96.1% @ 125s.
const INCUMBENT = { avgRecall: 96.1, avgDuplicateRate: 0.05, avgLatencyMs: 125_000, failures: 0 };

test('floors match the measured incumbent and product targets', () => {
  assert.equal(DEFAULT_RECALL_FLOOR, 96.1);
  assert.equal(COLLAPSE_RECALL_FLOOR, 90);
  assert.equal(COLLAPSE_MIN_SPEEDUP, 3);
});

test('pipeline-collapse passes on high single-call recall plus big speedup', () => {
  const g = evaluateGate({
    candidateRaw: { avgRecall: 92, avgDuplicateRate: 0.05, avgLatencyMs: 15_000, failures: 0 },
    candidatePipeline: null,
    incumbent: INCUMBENT,
  });
  assert.equal(g.pass, true);
  assert.equal(g.promotionBasis, 'pipeline-collapse');
  assert.equal(g.speedup, 8.33);
});

test('pipeline-collapse blocked when single-call recall is below the collapse floor', () => {
  const g = evaluateGate({
    candidateRaw: { avgRecall: 85, avgDuplicateRate: 0.05, avgLatencyMs: 10_000, failures: 0 },
    candidatePipeline: null,
    incumbent: INCUMBENT,
  });
  assert.equal(g.pass, false);
  assert.match(g.paths['pipeline-collapse'].reasons.join(' '), /below collapse floor 90%/);
});

test('pipeline-collapse blocked when it is not enough faster', () => {
  const g = evaluateGate({
    candidateRaw: { avgRecall: 95, avgDuplicateRate: 0.05, avgLatencyMs: 60_000, failures: 0 },
    candidatePipeline: null,
    incumbent: INCUMBENT,
  });
  assert.equal(g.pass, false);
  assert.match(g.paths['pipeline-collapse'].reasons.join(' '), /speedup 2.08x below required 3x/);
});

test('pipeline-model path passes a like-for-like swap at the incumbent floor', () => {
  const g = evaluateGate({
    candidateRaw: { avgRecall: 70, avgDuplicateRate: 0.05, avgLatencyMs: 12_000, failures: 0 },
    candidatePipeline: { avgRecall: 96.5, avgDuplicateRate: 0.05, avgLatencyMs: 120_000, failures: 0 },
    incumbent: INCUMBENT,
  });
  assert.equal(g.pass, true);
  assert.equal(g.promotionBasis, 'pipeline-model');
});

test('pipeline-model blocked below the incumbent floor', () => {
  const g = evaluateGate({
    candidateRaw: { avgRecall: 70, avgDuplicateRate: 0.05, avgLatencyMs: 12_000, failures: 0 },
    candidatePipeline: { avgRecall: 94, avgDuplicateRate: 0.05, avgLatencyMs: 120_000, failures: 0 },
    incumbent: INCUMBENT,
  });
  assert.equal(g.pass, false);
  assert.equal(g.promotionBasis, null);
  assert.match(g.paths['pipeline-model'].reasons.join(' '), /below incumbent floor 96.1%/);
});

test('collapse wins when both paths qualify — latency is the bigger product win', () => {
  const g = evaluateGate({
    candidateRaw: { avgRecall: 93, avgDuplicateRate: 0.05, avgLatencyMs: 14_000, failures: 0 },
    candidatePipeline: { avgRecall: 97, avgDuplicateRate: 0.05, avgLatencyMs: 120_000, failures: 0 },
    incumbent: INCUMBENT,
  });
  assert.equal(g.promotionBasis, 'pipeline-collapse');
});

test('duplicate-rate regression blocks either path', () => {
  const g = evaluateGate({
    candidateRaw: { avgRecall: 99, avgDuplicateRate: 0.4, avgLatencyMs: 10_000, failures: 0 },
    candidatePipeline: { avgRecall: 99, avgDuplicateRate: 0.4, avgLatencyMs: 120_000, failures: 0 },
    incumbent: INCUMBENT,
  });
  assert.equal(g.pass, false);
  assert.match(g.reasons.join(' '), /duplicate rate 0.4 worse than incumbent/);
});

test('fixture failures block promotion', () => {
  const g = evaluateGate({
    candidateRaw: { avgRecall: 95, avgDuplicateRate: 0.01, avgLatencyMs: 10_000, failures: 2 },
    candidatePipeline: null,
    incumbent: INCUMBENT,
  });
  assert.equal(g.pass, false);
  assert.match(g.paths['pipeline-collapse'].reasons.join(' '), /2 fixture failure/);
});

test('missing candidate scores fail closed', () => {
  const g = evaluateGate({ candidateRaw: null, candidatePipeline: null, incumbent: INCUMBENT });
  assert.equal(g.pass, false);
  assert.equal(g.promotionBasis, null);
});

test('nextVersion increments past the highest existing version', () => {
  assert.equal(nextVersion({ entries: [] }), 'v1');
  assert.equal(nextVersion({ entries: [{ version: 'v1' }, { version: 'v3' }] }), 'v4');
});

test('addEntry keeps exactly one active entry', () => {
  let reg = addEntry({ entries: [] }, { version: 'v1', candidateName: 'a' });
  reg = addEntry(reg, { version: 'v2', candidateName: 'b' });
  assert.equal(reg.entries.filter((e) => e.status === 'active').length, 1);
  assert.equal(activeEntry(reg).version, 'v2');
  assert.equal(reg.entries.find((e) => e.version === 'v1').status, 'archived');
});

test('rollback swaps active with the most recent archived entry', () => {
  let reg = addEntry({ entries: [] }, { version: 'v1', candidateName: 'a' });
  reg = addEntry(reg, { version: 'v2', candidateName: 'b' });
  const { registry, from, to } = rollback(reg);
  assert.equal(from.version, 'v2');
  assert.equal(to.version, 'v1');
  assert.equal(activeEntry(registry).version, 'v1');
  assert.equal(registry.entries.filter((e) => e.status === 'active').length, 1);
});

test('rollback is a no-op with nothing archived', () => {
  const reg = addEntry({ entries: [] }, { version: 'v1', candidateName: 'a' });
  assert.equal(rollback(reg).to, null);
});

const BENCHMARK = {
  fixtures: 8,
  results: [
    {
      name: 'candidate:qwen3vl-inventory', config: 'candidate-raw', license: 'Apache-2.0',
      aggregate: {
        avgRecall: 92, countAccuracy: 88, avgDuplicateRate: 0.02,
        avgLatencyMs: 15_000, recallPerSecond: 6.13,
      },
    },
    {
      name: 'api:pipeline[qwen3-vl:30b-a3b-instruct]', config: 'base-pipeline', license: 'ours',
      aggregate: {
        avgRecall: 96.1, countAccuracy: 100, avgDuplicateRate: 0.05,
        avgLatencyMs: 125_000, recallPerSecond: 0.77,
      },
    },
  ],
};

test('model card states collapse approval with the measured justification', () => {
  const gate = evaluateGate({
    candidateRaw: BENCHMARK.results[0].aggregate,
    candidatePipeline: null,
    incumbent: BENCHMARK.results[1].aggregate,
  });
  const card = renderModelCard({
    version: 'v1',
    candidateName: 'qwen3vl-inventory',
    baseModel: 'Qwen/Qwen3-VL-8B-Instruct',
    loraConfig: 'lora_rank: 8',
    datasetComposition: [{ name: 'coco-household', images: 1200, annotations: 8949, license: 'CC BY 4.0' }],
    benchmark: BENCHMARK,
    gate,
    gitSha: 'abc1234',
    date: '2026-07-30',
    artifactPath: 'training/output/vlm_lora/ckpt-merged',
  });
  assert.match(card, /Promotion basis.*pipeline-collapse/);
  assert.match(card, /tiling\/pass-2 may be DISABLED/);
  assert.match(card, /VLM_TWO_PASS=false/);
  assert.match(card, /measured speedup.*8\.33x/);
  assert.match(card, /pipeline distillation/i);
  assert.match(card, /candidate-raw/);
});

test('model card forbids collapse when promoted as a model swap', () => {
  const gate = evaluateGate({
    candidateRaw: { avgRecall: 70, avgDuplicateRate: 0.05, avgLatencyMs: 60_000, failures: 0 },
    candidatePipeline: { avgRecall: 97, avgDuplicateRate: 0.05, avgLatencyMs: 120_000, failures: 0 },
    incumbent: BENCHMARK.results[1].aggregate,
  });
  const card = renderModelCard({
    version: 'v2', candidateName: 'c', baseModel: 'b', loraConfig: 'x',
    datasetComposition: [], benchmark: BENCHMARK, gate,
    gitSha: 'd', date: '2026-07-30', artifactPath: 'p',
  });
  assert.match(card, /Promotion basis.*pipeline-model/);
  assert.match(card, /pipeline .* stays ON/s);
  assert.doesNotMatch(card, /may be DISABLED/);
});
