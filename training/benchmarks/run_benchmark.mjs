#!/usr/bin/env node
// Home-inventory benchmark: score every available contender against the repo
// oracle (eval/fixtures + eval/oracle, read-only) and emit a comparison table.
//
// Usage:
//   node training/benchmarks/run_benchmark.mjs [--only name1,name2]
//       [--candidate-url http://localhost:8000/v1] [--candidate-name tag]
//       [--base-model qwen3-vl:30b-a3b-instruct] [--pipeline-model <tag>]
//
// FOUR CONFIGURATIONS decide a candidate (see metrics.mjs CONFIGS):
//   candidate-raw       single call — THE HEADLINE (pipeline-collapse metric)
//   candidate-pipeline  candidate inside the production pipeline
//   base-raw            base model single call (control)
//   base-pipeline       base model in pipeline = the incumbent to beat
//
// The pipeline configs run through api-service, which serves whatever model its
// own env names; this harness never mutates api-service. Declare what is being
// served with --pipeline-model so the row is labelled honestly.
//
// Every contender is behind an availability probe: missing ones are reported
// as skipped with the reason, never crash the run.

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { CONFIGS, aggregate, extractJson, markdownTable, scoreFixture } from './metrics.mjs';

const BENCH_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_ROOT = path.resolve(BENCH_DIR, '..', '..');
const FIXTURES = path.join(REPO_ROOT, 'eval', 'fixtures');
const ORACLES = path.join(REPO_ROOT, 'eval', 'oracle');
const RESULTS = path.join(BENCH_DIR, 'results');
const OLLAMA = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const API_URL = process.env.API_URL ?? 'http://localhost:14000';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const PY = process.env.BENCH_PYTHON ?? 'python3';

// Same prompt the repo harness uses, so recall numbers are comparable.
const PROMPT = `You are cataloging a photo for a home inventory. Identify EVERY distinct physical item visible - furniture, appliances, electronics, decor, plants, lighting, wall art, rugs, curtains, and any other discrete objects. Aim for 6-15 items. Do not include the room itself, walls, ceiling, or floor as items (but DO include rugs, carpets, window treatments).

For each item, return a JSON array where each element has:
- "label": the most specific identifiable name (e.g. "snake plant", "tan leather office chair")
- "category": one of "Furniture","Plants","Lighting","Decor","Textiles","Electronics","Window Treatments","Appliances","Books","Art"
- "primary_color": dominant color
- "material": primary material
- "count": integer, how many of this item are visible (>=1)

Return a valid JSON array only. No markdown, no explanation.`;

async function resolveGeminiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  try {
    const envFile = await fs.readFile(path.join(REPO_ROOT, 'api-service', '.env'), 'utf-8');
    const line = envFile.split('\n').find((l) => l.startsWith('GEMINI_API_KEY='));
    return line ? line.slice('GEMINI_API_KEY='.length).trim() : '';
  } catch {
    return '';
  }
}

async function ollamaTags() {
  try {
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return (await res.json()).models?.map((m) => m.name) ?? [];
  } catch {
    return null;
  }
}

async function pyModuleAvailable(mod) {
  return new Promise((resolve) => {
    const child = spawn(PY, ['-c', `import ${mod}`], { stdio: 'ignore' });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

// ---------------------------------------------------------------- runners

async function runOllama(model, imagePath) {
  const t0 = Date.now();
  const imageB64 = (await fs.readFile(imagePath)).toString('base64');
  try {
    const res = await fetch(`${OLLAMA}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: PROMPT,
        images: [imageB64],
        stream: false,
        options: { num_ctx: 4096, temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(600_000),
    });
    if (!res.ok) {
      return { text: '', elapsedMs: Date.now() - t0, error: `HTTP ${res.status}` };
    }
    return { text: (await res.json()).response ?? '', elapsedMs: Date.now() - t0 };
  } catch (e) {
    return { text: '', elapsedMs: Date.now() - t0, error: String(e) };
  }
}

async function runGemini(model, imagePath, apiKey) {
  const t0 = Date.now();
  const imageB64 = (await fs.readFile(imagePath)).toString('base64');
  try {
    const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: imageB64 } }, { text: PROMPT }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) return { text: '', elapsedMs: Date.now() - t0, error: `HTTP ${res.status}` };
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    return { text, elapsedMs: Date.now() - t0 };
  } catch (e) {
    return { text: '', elapsedMs: Date.now() - t0, error: String(e) };
  }
}

async function runProductionApi(imagePath) {
  const t0 = Date.now();
  const form = new FormData();
  form.append('frame', new Blob([await fs.readFile(imagePath)], { type: 'image/jpeg' }), 'frame.jpg');
  try {
    const res = await fetch(`${API_URL}/v1/detect/stream`, {
      method: 'POST',
      headers: { 'x-api-key': process.env.API_KEY ?? 'eval' },
      body: form,
      signal: AbortSignal.timeout(1_800_000),
    });
    if (!res.ok) return { text: '', elapsedMs: Date.now() - t0, error: `HTTP ${res.status}` };
    const sse = await res.text();
    const items = [];
    for (const block of sse.split('\n\n')) {
      const lines = block.split('\n');
      if (lines[0] !== 'event: item') continue;
      const dataLine = lines.find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      try {
        const d = JSON.parse(dataLine.slice(6));
        items.push({ label: d.label ?? 'unknown', category: d.category ?? 'unknown', count: 1 });
      } catch { /* skip malformed */ }
    }
    return { text: JSON.stringify(items), elapsedMs: Date.now() - t0 };
  } catch (e) {
    return { text: '', elapsedMs: Date.now() - t0, error: String(e) };
  }
}

async function runOpenAiCompatible(baseUrl, model, imagePath) {
  const t0 = Date.now();
  const imageB64 = (await fs.readFile(imagePath)).toString('base64');
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageB64}` } },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(600_000),
    });
    if (!res.ok) return { text: '', elapsedMs: Date.now() - t0, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { text: data.choices?.[0]?.message?.content ?? '', elapsedMs: Date.now() - t0 };
  } catch (e) {
    return { text: '', elapsedMs: Date.now() - t0, error: String(e) };
  }
}

/** Reference detectors run through the python sidecar, one process per fixture. */
async function runReferenceDetector(arch, imagePath) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const child = spawn(
      PY,
      [path.join(BENCH_DIR, 'reference_detectors.py'), '--arch', arch, '--image', imagePath],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      if (code !== 0) {
        resolve({ text: '', elapsedMs: Date.now() - t0, error: err.trim().slice(0, 200) || `exit ${code}` });
        return;
      }
      resolve({ text: out, elapsedMs: Date.now() - t0 });
    });
    child.on('error', (e) => resolve({ text: '', elapsedMs: Date.now() - t0, error: String(e) }));
  });
}

// ---------------------------------------------------------------- contenders

function buildContenders(opts) {
  const { tags, geminiKey, candidateUrl, candidateName, baseModel, pipelineModel } = opts;
  const has = (m) => Array.isArray(tags) && tags.includes(m);
  const apiAvailable = async () => {
    try {
      const res = await fetch(`${API_URL}/`, { signal: AbortSignal.timeout(4000) });
      return res.status > 0 ? true : 'api-service not responding';
    } catch {
      return `api-service unreachable at ${API_URL} (run 'make dev-api')`;
    }
  };
  // The pipeline configs go through api-service, which serves whatever model
  // its own env points at — this harness never mutates api-service. The
  // operator declares what is being served via --pipeline-model so the row is
  // labelled honestly, and that declaration decides whether the pipeline run
  // counts as the incumbent (base) or the candidate.
  const pipelineIsCandidate = Boolean(pipelineModel) && pipelineModel === candidateName;
  return [
    {
      name: `api:pipeline[${pipelineModel ?? 'unknown-model'}]`,
      config: pipelineIsCandidate ? CONFIGS.CANDIDATE_PIPELINE : CONFIGS.BASE_PIPELINE,
      license: 'proprietary (ours)',
      deployment: 'server (two-pass + tiling)',
      available: async () => {
        const ok = await apiAvailable();
        if (ok !== true) return ok;
        return (
          Boolean(pipelineModel) ||
          'pass --pipeline-model <tag> naming the model api-service currently serves'
        );
      },
      run: (img) => runProductionApi(img),
    },
    {
      name: baseModel,
      config: CONFIGS.BASE_RAW,
      license: 'Apache-2.0',
      deployment: 'local Ollama (single call)',
      available: async () =>
        tags === null ? 'Ollama unreachable' : has(baseModel) || `${baseModel} not pulled`,
      run: (img) => runOllama(baseModel, img),
    },
    {
      name: 'qwen3-vl:8b-instruct',
      config: baseModel === 'qwen3-vl:8b-instruct' ? CONFIGS.BASE_RAW : undefined,
      license: 'Apache-2.0',
      deployment: 'local Ollama (6.1GB)',
      available: async () =>
        tags === null ? 'Ollama unreachable' : has('qwen3-vl:8b-instruct') || 'model not pulled',
      run: (img) => runOllama('qwen3-vl:8b-instruct', img),
    },
    {
      name: 'gemma4:31b-cloud',
      license: 'Gemma Terms of Use',
      deployment: 'Ollama cloud (free tier)',
      available: async () =>
        tags === null ? 'Ollama unreachable' : has('gemma4:31b-cloud') || 'cloud model not configured',
      run: (img) => runOllama('gemma4:31b-cloud', img),
    },
    {
      name: 'gemini-2.5-flash',
      license: 'proprietary API',
      deployment: 'cloud API',
      available: async () => Boolean(geminiKey) || 'GEMINI_API_KEY not set',
      run: (img) => runGemini('gemini-2.5-flash', img, geminiKey),
    },
    {
      // THE HEADLINE METRIC: single-call recall decides whether tiling and
      // pass-2 can be switched off (pipeline collapse).
      name: `candidate:${candidateName}`,
      config: CONFIGS.CANDIDATE_RAW,
      license: 'Apache-2.0 (Qwen3-VL base + our LoRA)',
      deployment: candidateUrl ? 'vLLM / llama-server (single call)' : 'local Ollama (single call)',
      available: async () => {
        if (candidateUrl) {
          try {
            const res = await fetch(`${candidateUrl}/models`, { signal: AbortSignal.timeout(4000) });
            return res.ok || `candidate endpoint ${candidateUrl} not serving`;
          } catch {
            return `candidate endpoint ${candidateUrl} unreachable`;
          }
        }
        if (tags === null) return 'no --candidate-url and Ollama unreachable';
        return (
          has(candidateName) ||
          `no --candidate-url and '${candidateName}' not in Ollama (train + serve a candidate first)`
        );
      },
      run: (img) =>
        candidateUrl
          ? runOpenAiCompatible(candidateUrl, candidateName, img)
          : runOllama(candidateName, img),
    },
    {
      name: 'yoloe-11l-seg (open-vocab)',
      license: 'AGPL-3.0 — NOT SHIPPABLE',
      deployment: 'reference only',
      referenceOnly: true,
      available: async () =>
        (await pyModuleAvailable('ultralytics')) || 'pip install ultralytics (AGPL) in BENCH_PYTHON',
      run: (img) => runReferenceDetector('yoloe', img),
    },
    {
      name: 'rtdetr-l (closed-set COCO)',
      license: 'AGPL-3.0 via ultralytics — NOT SHIPPABLE',
      deployment: 'reference only',
      referenceOnly: true,
      available: async () =>
        (await pyModuleAvailable('ultralytics')) || 'pip install ultralytics (AGPL) in BENCH_PYTHON',
      run: (img) => runReferenceDetector('rtdetr', img),
    },
    {
      name: 'grounding-dino-tiny (open-vocab)',
      license: 'Apache-2.0',
      deployment: 'reference only',
      referenceOnly: true,
      available: async () =>
        (await pyModuleAvailable('transformers')) || 'pip install transformers torch in BENCH_PYTHON',
      run: (img) => runReferenceDetector('grounding-dino', img),
    },
  ];
}

// ---------------------------------------------------------------- main

async function main() {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i !== -1 ? args[i + 1] : fallback;
  };
  const only = (flag('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const candidateUrl = (flag('candidate-url', process.env.CANDIDATE_URL) || '').replace(/\/$/, '');
  const candidateName = flag('candidate-name', process.env.CANDIDATE_NAME ?? 'qwen3vl-inventory');
  const baseModel = flag('base-model', process.env.BASE_MODEL_TAG ?? 'qwen3-vl:30b-a3b-instruct');
  const pipelineModel = flag('pipeline-model', process.env.PIPELINE_MODEL ?? '');

  const fixtureFiles = (await fs.readdir(FIXTURES)).filter((f) => f.endsWith('.jpg')).sort();
  const oracles = {};
  for (const f of fixtureFiles) {
    const name = f.replace('.jpg', '');
    oracles[name] = JSON.parse(await fs.readFile(path.join(ORACLES, `${name}.json`), 'utf-8'));
  }
  console.log(`fixtures: ${fixtureFiles.length}`);

  const contenders = buildContenders({
    tags: await ollamaTags(),
    geminiKey: await resolveGeminiKey(),
    candidateUrl,
    candidateName,
    baseModel,
    pipelineModel: pipelineModel || null,
  }).filter((c) => only.length === 0 || only.includes(c.name));

  const results = [];
  const skipped = [];
  for (const c of contenders) {
    const ok = await c.available();
    if (ok !== true) {
      skipped.push({ name: c.name, reason: typeof ok === 'string' ? ok : 'unavailable' });
      console.log(`SKIP ${c.name}: ${ok}`);
      continue;
    }
    console.log(`\n=== ${c.name} ===`);
    const perFixture = [];
    for (const f of fixtureFiles) {
      const name = f.replace('.jpg', '');
      process.stdout.write(`  ${name}: `);
      const r = await c.run(path.join(FIXTURES, f));
      if (r.error) {
        console.log(`ERROR (${r.elapsedMs}ms): ${r.error.slice(0, 90)}`);
        perFixture.push({ fixture: name, error: r.error, elapsedMs: r.elapsedMs });
        continue;
      }
      const score = scoreFixture(extractJson(r.text), oracles[name]);
      perFixture.push({ fixture: name, ...score, elapsedMs: r.elapsedMs });
      console.log(
        `recall=${score.recall}% items=${score.itemCount}/${score.expectedMin}-${score.expectedMax}` +
          ` dup=${score.duplicateRate} t=${r.elapsedMs}ms`,
      );
    }
    const agg = aggregate(perFixture);
    results.push({
      name: c.name,
      config: c.config,
      license: c.license,
      deployment: c.deployment,
      referenceOnly: Boolean(c.referenceOnly),
      perFixture,
      aggregate: agg,
    });
    console.log(
      `  AGG recall=${agg.avgRecall}% countAcc=${agg.countAccuracy}% dup=${agg.avgDuplicateRate}` +
        ` latency=${agg.avgLatencyMs}ms fail=${agg.failures}/${agg.n}`,
    );
  }

  const table = markdownTable(results, skipped);
  console.log(`\n${table}\n`);

  await fs.mkdir(RESULTS, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const jsonPath = path.join(RESULTS, `benchmark-${stamp}.json`);
  const mdPath = path.join(RESULTS, `benchmark-${stamp}.md`);
  await fs.writeFile(
    jsonPath,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), fixtures: fixtureFiles.length, results, skipped },
      null,
      2,
    ),
  );
  await fs.writeFile(mdPath, `# Home-inventory benchmark ${stamp}\n\n${table}\n`);
  console.log(`json: ${jsonPath}\nmd:   ${mdPath}`);
  return results.length === 0 ? 1 : 0;
}

process.exit(await main());
