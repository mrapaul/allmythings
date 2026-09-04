#!/usr/bin/env node
// Release gate for a trained candidate: oracle eval -> benchmark -> gate ->
// model card + registry entry -> activation / rollback instructions.
//
// Usage:
//   node training/release/promote.mjs --candidate qwen3vl-inventory \
//       [--candidate-url http://localhost:8000/v1] \
//       [--artifact training/output/vlm_lora/.../checkpoint-N-merged] \
//       [--recall-floor 96.1] [--skip-eval] [--skip-benchmark]
//   node training/release/promote.mjs --rollback
//
// Never mutates api-service — it prints the env change for a human to apply.

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_RECALL_FLOOR, activeEntry, addEntry, evaluateGate, nextVersion,
  renderModelCard, rollback,
} from './gate.mjs';

const RELEASE_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_ROOT = path.resolve(RELEASE_DIR, '..', '..');
const REGISTRY = path.join(RELEASE_DIR, 'registry.json');
const CARDS = path.join(RELEASE_DIR, 'cards');
const BENCH_RESULTS = path.join(REPO_ROOT, 'training', 'benchmarks', 'results');

function flag(args, name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : fallback;
}

async function readJson(p, fallback) {
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8'));
  } catch {
    return fallback;
  }
}

function sh(cmd, cmdArgs, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, cmdArgs, { stdio: 'inherit', cwd: REPO_ROOT, env: { ...process.env, ...env } });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

async function gitSha() {
  return new Promise((resolve) => {
    const child = spawn('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('close', () => resolve(out.trim() || 'unknown'));
    child.on('error', () => resolve('unknown'));
  });
}

async function newestBenchmark() {
  const files = (await fs.readdir(BENCH_RESULTS).catch(() => []))
    .filter((f) => f.startsWith('benchmark-') && f.endsWith('.json'))
    .sort();
  if (files.length === 0) return null;
  return readJson(path.join(BENCH_RESULTS, files[files.length - 1]), null);
}

async function datasetComposition() {
  const bootstrapRoot = path.join(REPO_ROOT, 'training', 'data', 'bootstrap');
  const out = [];
  const licenses = {
    'coco-household': 'COCO annotations CC BY 4.0',
    'furniture-hf': 'CC BY 4.0 (Roboflow 100)',
  };
  for (const dir of await fs.readdir(bootstrapRoot).catch(() => [])) {
    const coco = await readJson(path.join(bootstrapRoot, dir, 'annotations.json'), null);
    if (!coco) continue;
    out.push({
      name: dir,
      images: coco.images?.length ?? 0,
      annotations: coco.annotations?.length ?? 0,
      license: licenses[dir] ?? 'see source',
    });
  }
  const exports = (await fs.readdir(path.join(REPO_ROOT, 'datasets')).catch(() => []))
    .filter((d) => d.startsWith('export-')).sort();
  if (exports.length > 0) {
    const coco = await readJson(
      path.join(REPO_ROOT, 'datasets', exports[exports.length - 1], 'annotations.json'), null,
    );
    if (coco) {
      out.push({
        name: `flywheel (${exports[exports.length - 1]})`,
        images: coco.images?.length ?? 0,
        annotations: coco.annotations?.length ?? 0,
        license: 'user-contributed (ours)',
      });
    }
  }
  return out;
}

async function doRollback() {
  const registry = await readJson(REGISTRY, { entries: [] });
  const { registry: updated, from, to } = rollback(registry);
  if (!to) {
    console.error('nothing to roll back to (need at least one archived entry)');
    return 1;
  }
  await fs.writeFile(REGISTRY, JSON.stringify(updated, null, 2));
  console.log(`rolled back: ${from?.version ?? 'none'} -> ${to.version} (${to.candidateName})`);
  printActivation(to);
  return 0;
}

function printActivation(entry) {
  console.log('\n--- ACTIVATE (human step; api-service is never modified by this script) ---');
  if (entry.serving === 'ollama') {
    console.log(`  # api-service/.env\n  OLLAMA_MODEL=${entry.candidateName}`);
  } else {
    console.log(`  vllm serve ${entry.artifactPath} --served-model-name ${entry.candidateName}`);
    console.log('  # api-service needs an OpenAI-compatible VlmClient to consume this');
  }
  if (entry.promotionBasis === 'pipeline-collapse') {
    console.log(
      `  # pipeline collapse approved (${entry.speedupVsIncumbent}x faster): additionally set\n` +
        '  VLM_TWO_PASS=false   # and disable adaptive tiling, then re-run the oracle eval',
    );
  } else {
    console.log('  # keep the pipeline ON (two-pass + tiling) — promoted as a model swap only');
  }
  console.log('\n--- ROLL BACK ---\n  node training/release/promote.mjs --rollback');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--rollback')) return doRollback();

  const candidateName = flag(args, 'candidate', process.env.CANDIDATE_NAME);
  if (!candidateName) {
    console.error('Usage: node training/release/promote.mjs --candidate <name> [--candidate-url URL]');
    return 1;
  }
  const candidateUrl = flag(args, 'candidate-url', process.env.CANDIDATE_URL ?? '');
  const artifactPath = flag(args, 'artifact', 'training/output/vlm_lora (merged checkpoint)');
  const recallFloor = Number(flag(args, 'recall-floor', DEFAULT_RECALL_FLOOR));

  if (!args.includes('--skip-eval')) {
    console.log('\n=== (a) oracle eval ===');
    const evalArgs = [path.join(REPO_ROOT, 'training', 'eval_candidate.mjs'), candidateName];
    if (candidateUrl) evalArgs.push('--url', candidateUrl);
    const code = await sh('node', evalArgs);
    if (code !== 0) {
      console.error('oracle eval failed — refusing to promote');
      return 1;
    }
  }

  if (!args.includes('--skip-benchmark')) {
    console.log('\n=== (b) benchmark suite ===');
    const benchArgs = [path.join(REPO_ROOT, 'training', 'benchmarks', 'run_benchmark.mjs')];
    if (candidateUrl) benchArgs.push('--candidate-url', candidateUrl, '--candidate-name', candidateName);
    await sh('node', benchArgs);
  }

  console.log('\n=== (c) gate ===');
  const benchmark = await newestBenchmark();
  if (!benchmark) {
    console.error('no benchmark results found — run the benchmark before promoting');
    return 1;
  }
  const byConfig = (c) => benchmark.results.find((r) => r.config === c)?.aggregate ?? null;
  const gate = evaluateGate({
    candidateRaw: byConfig('candidate-raw'),
    candidatePipeline: byConfig('candidate-pipeline'),
    incumbent: byConfig('base-pipeline'),
    recallFloor,
  });
  for (const [name, path] of Object.entries(gate.paths)) {
    console.log(`  ${name}: ${path.pass ? 'PASS' : 'fail'}`);
    for (const r of path.reasons) console.log(`    - ${r}`);
  }
  console.log(`gate: ${gate.pass ? `PASS via ${gate.promotionBasis}` : 'FAIL'}`);
  if (!gate.pass) {
    console.error('\nnot promoted.');
    return 2;
  }

  console.log('\n=== (d) model card ===');
  const registry = await readJson(REGISTRY, { entries: [] });
  const version = nextVersion(registry);
  const configPath = path.join(REPO_ROOT, 'training', 'vlm_lora', 'config.yaml');
  const card = renderModelCard({
    version,
    candidateName,
    baseModel: process.env.BASE_MODEL ?? 'Qwen/Qwen3-VL-8B-Instruct',
    loraConfig: await fs.readFile(configPath, 'utf-8').catch(() => 'unavailable'),
    datasetComposition: await datasetComposition(),
    benchmark,
    gate,
    gitSha: await gitSha(),
    date: new Date().toISOString().slice(0, 10),
    artifactPath,
  });
  await fs.mkdir(CARDS, { recursive: true });
  const cardPath = path.join(CARDS, `${version}-${candidateName.replace(/[/:]/g, '_')}.md`);
  await fs.writeFile(cardPath, card);
  console.log(`card: ${cardPath}`);

  console.log('\n=== (e) registry ===');
  const entry = {
    version,
    candidateName,
    artifactPath,
    serving: candidateUrl ? 'openai-compatible' : 'ollama',
    promotionBasis: gate.promotionBasis,
    speedupVsIncumbent: gate.speedup,
    scores: {
      candidateRaw: byConfig('candidate-raw'),
      candidatePipeline: byConfig('candidate-pipeline'),
      incumbent: byConfig('base-pipeline'),
    },
    cardPath: path.relative(REPO_ROOT, cardPath),
    promotedAt: new Date().toISOString(),
  };
  const updated = addEntry(registry, entry);
  await fs.writeFile(REGISTRY, JSON.stringify(updated, null, 2));
  console.log(`registry: ${REGISTRY} (${version} active, previous archived)`);

  printActivation(activeEntry(updated));
  return 0;
}

process.exit(await main());
