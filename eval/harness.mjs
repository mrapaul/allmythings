#!/usr/bin/env node
// Eval harness: run each candidate VLM against every fixture, score against oracle gold.
// Usage: node eval/harness.mjs [modelTag1] [modelTag2] ...
// Requires Ollama running at localhost:11434.

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildColourLexicon, parseLabel, scoreRun } from './scoring.mjs';
import { buildTokenEq, tokenUniverse } from './synonyms.mjs';

// Global fetch rides undici defaults (headersTimeout/bodyTimeout 300s), which
// silently kills slow backend responses ("fetch failed", not our AbortError).
// Resolve undici from api-service (same trick as resolveGeminiKey below) and
// give the raw Ollama path a dispatcher whose timeouts honor OLLAMA_TIMEOUT_MS.
const require = createRequire(new URL('../api-service/package.json', import.meta.url));
const { Agent } = require('undici');

const EVAL_ROOT = path.dirname(new URL(import.meta.url).pathname);
const FIXTURES = path.join(EVAL_ROOT, 'fixtures');
const ORACLES  = path.join(EVAL_ROOT, 'oracle');
const RUNS     = path.join(EVAL_ROOT, 'runs');
const OLLAMA      = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
// Remote/CPU backends (e.g. the Tailscale nixos box) can blow past the local
// 3-min budget; override without editing code. Default keeps local behavior.
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 180_000);
const ollamaDispatcher = new Agent({
  headersTimeout: OLLAMA_TIMEOUT_MS,
  bodyTimeout: OLLAMA_TIMEOUT_MS,
  connectTimeout: 30_000,
});
const HYBRID_URL  = process.env.HYBRID_URL ?? 'http://localhost:14000/v1/detect?mode=full';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// GEMINI_API_KEY from env, falling back to api-service/.env so `make eval`
// works without exporting anything.
async function resolveGeminiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  try {
    const envFile = await fs.readFile(path.join(EVAL_ROOT, '..', 'api-service', '.env'), 'utf-8');
    const line = envFile.split('\n').find((l) => l.startsWith('GEMINI_API_KEY='));
    return line ? line.slice('GEMINI_API_KEY='.length).trim() : '';
  } catch {
    return '';
  }
}

const PROMPT = `You are cataloging a photo for a home inventory. Identify EVERY distinct physical item visible - furniture, appliances, electronics, decor, plants, lighting, wall art, rugs, curtains, and any other discrete objects. Aim for 6-15 items. Do not include the room itself, walls, ceiling, or floor as items (but DO include rugs, carpets, window treatments).

For each item, return a JSON array where each element has:
- "label": the most specific identifiable name (e.g. "snake plant", "tan leather office chair")
- "category": one of "Furniture","Plants","Lighting","Decor","Textiles","Electronics","Window Treatments","Appliances","Books","Art"
- "primary_color": dominant color
- "material": primary material
- "count": integer, how many of this item are visible (>=1)

Return a valid JSON array only. No markdown, no explanation.`;

async function runModel(model, imagePath) {
  const t0 = Date.now();
  const imageB64 = (await fs.readFile(imagePath)).toString('base64');

  const MAX_ATTEMPTS = 3;
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      // Warmup on retry
      await fetch(`${OLLAMA}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: 'hi', stream: false, options: { num_ctx: 4096, num_predict: 1 } }),
        signal: AbortSignal.timeout(30000),
        dispatcher: ollamaDispatcher,
      }).catch(() => undefined);
    }
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
        signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
        dispatcher: ollamaDispatcher,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        lastErr = new Error(`${res.status}: ${body.slice(0, 300)}`);
        continue;
      }
      const data = await res.json();
      const text = data.response ?? '';
      return { text, elapsedMs: Date.now() - t0, attempt };
    } catch (e) {
      lastErr = e;
    }
  }
  return { text: '', elapsedMs: Date.now() - t0, error: String(lastErr), attempt: MAX_ATTEMPTS };
}

async function runGemini(model, imagePath, apiKey) {
  const t0 = Date.now();
  if (!apiKey) return { text: '', elapsedMs: 0, error: 'GEMINI_API_KEY not set', attempt: 1 };
  const imageB64 = (await fs.readFile(imagePath)).toString('base64');
  const MAX_ATTEMPTS = 3;
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: 'image/jpeg', data: imageB64 } },
            { text: PROMPT },
          ] }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        lastErr = new Error(`${res.status}: ${body.slice(0, 300)}`);
        // Back off on free-tier rate limits before retrying.
        if (res.status === 429) await new Promise((r) => setTimeout(r, 15_000));
        continue;
      }
      const data = await res.json();
      const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
      return { text, elapsedMs: Date.now() - t0, attempt };
    } catch (e) {
      lastErr = e;
    }
  }
  return { text: '', elapsedMs: Date.now() - t0, error: String(lastErr), attempt: MAX_ATTEMPTS };
}

// Score the PRODUCTION detector (two-pass + adaptive tiling + dedupe) via the
// live api-service, instead of a raw single model call. Tag: api:<anything>.
// DETECT_TIER=quality routes through the API's quality VLM tier (?tier=quality).
async function runProductionApi(imagePath) {
  const t0 = Date.now();
  const apiUrl = process.env.API_URL ?? 'http://localhost:14000';
  const tierQs = process.env.DETECT_TIER ? `?tier=${process.env.DETECT_TIER}` : '';
  const form = new FormData();
  form.append('frame', new Blob([await fs.readFile(imagePath)], { type: 'image/jpeg' }), 'frame.jpg');
  try {
    // The SSE endpoint sends headers immediately, so long detections don't
    // trip undici's 300s response-headers timeout like sync /v1/detect does.
    const res = await fetch(`${apiUrl}/v1/detect/stream${tierQs}`, {
      method: 'POST',
      headers: { 'x-api-key': 'eval' },
      body: form,
      signal: AbortSignal.timeout(1_800_000),
    });
    if (!res.ok) return { text: '', elapsedMs: Date.now() - t0, error: `HTTP ${res.status}`, attempt: 1 };
    const sse = await res.text();
    const items = [];
    for (const block of sse.split('\n\n')) {
      const lines = block.split('\n');
      // A terminal error event (e.g. DetectorUnavailableError after a backend
      // timeout) must surface as a failed run, not a fake 0-item success.
      if (lines[0] === 'event: error') {
        const errLine = lines.find((l) => l.startsWith('data: '));
        let msg = 'stream error';
        try {
          msg = JSON.parse(errLine?.slice(6) ?? '{}').error ?? msg;
        } catch { /* keep default */ }
        return { text: '', elapsedMs: Date.now() - t0, error: msg, attempt: 1 };
      }
      if (lines[0] !== 'event: item') continue;
      const dataLine = lines.find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      try {
        const d = JSON.parse(dataLine.slice(6));
        items.push({ label: d.label ?? 'unknown', category: d.category ?? 'unknown', count: 1 });
      } catch { /* skip malformed */ }
    }
    return { text: JSON.stringify(items), elapsedMs: Date.now() - t0, attempt: 1 };
  } catch (e) {
    return { text: '', elapsedMs: Date.now() - t0, error: String(e), attempt: 1 };
  }
}

async function runPipelineEndpoint(imagePath) {
  const t0 = Date.now();
  const form = new FormData();
  const file = new Blob([await fs.readFile(imagePath)], { type: 'image/jpeg' });
  form.append('file', file, 'image.jpg');
  try {
    const res = await fetch(HYBRID_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(180_000) });
    if (!res.ok) return { text: '', elapsedMs: Date.now() - t0, error: `HTTP ${res.status}`, attempt: 1 };
    const data = await res.json();
    // Support both old (fused[]) and new (items[]) response formats
    const raw = data.items ?? data.fused ?? [];
    const items = raw.map((d) => ({
      label: d.label ?? d.attributes?.name ?? 'unknown',
      category: d.attributes?.category ?? d.category ?? 'unknown',
      count: 1,
    }));
    return { text: JSON.stringify(items), elapsedMs: Date.now() - t0, attempt: 1 };
  } catch (e) {
    return { text: '', elapsedMs: Date.now() - t0, error: String(e), attempt: 1 };
  }
}

function extractJson(text) {
  if (!text) return [];
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  // eslint-disable-next-line no-control-regex
  cleaned = cleaned.replace(/[\x00-\x1F\x7F-\x9F]/g, ' ');
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Matching/scoring lives in scoring.mjs so eval/rescore.mjs can re-score saved
// runs and eval/scoring.test.mjs can unit-test the matcher.

async function main() {
  const args = process.argv.slice(2);
  const ci = args.includes('--ci');
  const models = args.filter((a) => !a.startsWith('--'));
  if (models.length === 0) {
    console.error('Usage: node harness.mjs <model1> [model2] ... [--ci]');
    process.exit(1);
  }

  await fs.mkdir(RUNS, { recursive: true });
  const geminiKey = await resolveGeminiKey();
  const baseline = ci
    ? JSON.parse(await fs.readFile(path.join(EVAL_ROOT, 'baseline.json'), 'utf-8').catch(() => '{}'))
    : null;

  // FIXTURES=name1,name2 narrows the run for fast spot-checks.
  const only = (process.env.FIXTURES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const fixtureFiles = (await fs.readdir(FIXTURES))
    .filter((f) => f.endsWith('.jpg'))
    .filter((f) => only.length === 0 || only.includes(f.replace('.jpg', '')))
    .sort();
  const oracles = {};
  for (const f of fixtureFiles) {
    const name = f.replace('.jpg', '');
    oracles[name] = JSON.parse(await fs.readFile(path.join(ORACLES, `${name}.json`), 'utf-8'));
  }
  // Colour words come from the answer key's own `colors` fields, so the
  // conflict veto never depends on a hardcoded colour list.
  const colourLexicon = buildColourLexicon(Object.values(oracles));
  const scoreOpts = async (oracle, extracted) => {
    const labels = [
      ...(oracle.expected_items ?? []).map((e) => e.label),
      ...extracted.map((c) => c?.label ?? ''),
    ];
    const tokenEq = await buildTokenEq(tokenUniverse(parseLabel, labels));
    return { colourLexicon, ...(tokenEq ? { tokenEq } : {}) };
  };

  const summary = {};
  for (const model of models) {
    console.log(`\n=== MODEL: ${model} ===`);
    summary[model] = { perFixture: [], aggregate: {} };
    let totalRecall = 0, totalCount = 0, totalMs = 0, failures = 0;
    for (const f of fixtureFiles) {
      const name = f.replace('.jpg', '');
      const imagePath = path.join(FIXTURES, f);
      process.stdout.write(`  ${name}: `);
      const useEndpoint = model.startsWith('hybrid:') || model.startsWith('florence:');
      const runResult = model.startsWith('api:')
        ? await runProductionApi(imagePath)
        : model.startsWith('gemini:')
          ? await runGemini(model.slice('gemini:'.length), imagePath, geminiKey)
          : useEndpoint
            ? await runPipelineEndpoint(imagePath)
            : await runModel(model, imagePath);
      if (runResult.error) {
        failures++;
        console.log(`ERROR (${runResult.elapsedMs}ms): ${runResult.error.slice(0, 80)}`);
        summary[model].perFixture.push({ fixture: name, error: runResult.error, elapsedMs: runResult.elapsedMs });
        continue;
      }
      const extracted = extractJson(runResult.text);
      const score = scoreRun(extracted, oracles[name], await scoreOpts(oracles[name], extracted));
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const runPath = path.join(RUNS, `${model.replace(/[/:]/g, '_')}__${name}__${timestamp}.json`);
      await fs.writeFile(runPath, JSON.stringify({ model, fixture: name, extracted, raw: runResult.text, score, elapsedMs: runResult.elapsedMs, attempts: runResult.attempt }, null, 2));
      totalRecall += score.recall;
      totalCount += score.itemCount;
      totalMs += runResult.elapsedMs;
      console.log(`recall=${score.recall}% items=${score.itemCount}/${score.expectedMin}-${score.expectedMax} t=${runResult.elapsedMs}ms a=${runResult.attempt}`);
      summary[model].perFixture.push({ fixture: name, ...score, elapsedMs: runResult.elapsedMs, attempts: runResult.attempt });
    }
    const n = fixtureFiles.length - failures;
    summary[model].aggregate = {
      avgRecall: n > 0 ? +(totalRecall / n).toFixed(1) : 0,
      avgItems: n > 0 ? +(totalCount / n).toFixed(1) : 0,
      avgLatencyMs: n > 0 ? Math.round(totalMs / n) : 0,
      failures,
      n: fixtureFiles.length,
    };
    console.log(`  AGG: recall=${summary[model].aggregate.avgRecall}% items=${summary[model].aggregate.avgItems} latency=${summary[model].aggregate.avgLatencyMs}ms failures=${failures}/${fixtureFiles.length}`);
  }

  const reportPath = path.join(EVAL_ROOT, `report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`);
  await fs.writeFile(reportPath, JSON.stringify(summary, null, 2));
  console.log(`\nReport: ${reportPath}`);

  console.log('\n=== LEADERBOARD ===');
  const ranked = Object.entries(summary).sort(([, a], [, b]) => (b.aggregate.avgRecall ?? 0) - (a.aggregate.avgRecall ?? 0));
  console.log('Model                              Recall  Items  Latency  Fail');
  console.log('---------------------------------- ------  -----  -------  ----');
  for (const [m, s] of ranked) {
    console.log(`${m.padEnd(34)} ${String(s.aggregate.avgRecall).padStart(5)}%  ${String(s.aggregate.avgItems).padStart(5)}  ${String(s.aggregate.avgLatencyMs).padStart(6)}ms  ${s.aggregate.failures}/${s.aggregate.n}`);
  }

  if (ci && baseline) {
    console.log('\n=== BASELINE GATE ===');
    let regressed = false;
    for (const [m, s] of Object.entries(summary)) {
      const b = baseline[m]?.aggregate?.avgRecall;
      if (typeof b !== 'number') { console.log(`${m}: no baseline (skipped)`); continue; }
      const delta = s.aggregate.avgRecall - b;
      const tag = delta < -1 ? 'REGRESSION' : delta > 1 ? 'IMPROVED' : 'stable';
      console.log(`${m}: baseline=${b}% current=${s.aggregate.avgRecall}% delta=${delta.toFixed(1)}% [${tag}]`);
      if (delta < -1) regressed = true;
    }
    if (regressed) {
      console.error('\nCI FAIL: at least one model regressed >1% below baseline');
      process.exit(2);
    }
    console.log('\nCI PASS');
  }
}

await main();
