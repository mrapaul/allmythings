#!/usr/bin/env node
// Eval harness: run each candidate VLM against every fixture, score against oracle gold.
// Usage: node eval/harness.mjs [modelTag1] [modelTag2] ...
// Requires Ollama running at localhost:11434.

import fs from 'node:fs/promises';
import path from 'node:path';

const EVAL_ROOT = path.dirname(new URL(import.meta.url).pathname);
const FIXTURES = path.join(EVAL_ROOT, 'fixtures');
const ORACLES  = path.join(EVAL_ROOT, 'oracle');
const RUNS     = path.join(EVAL_ROOT, 'runs');
const OLLAMA      = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const HYBRID_URL  = process.env.HYBRID_URL ?? 'http://localhost:14000/v1/detect?mode=full';

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
        signal: AbortSignal.timeout(180_000),
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

// Token-based fuzzy match: does candidate label match any oracle expected label
function labelsMatch(candidate, expected) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const c = new Set(norm(candidate));
  const e = new Set(norm(expected));
  // Expected is matched if any non-trivial token overlaps
  const shared = [...e].filter((t) => c.has(t) && t.length > 2);
  return shared.length >= 1;
}

function scoreRun(extracted, oracle) {
  const expected = oracle.expected_items;
  const matchedOracle = new Set();
  for (const cand of extracted) {
    const label = cand.label ?? '';
    for (let i = 0; i < expected.length; i++) {
      if (matchedOracle.has(i)) continue;
      if (labelsMatch(label, expected[i].label)) {
        matchedOracle.add(i);
        break;
      }
    }
  }
  const recall = matchedOracle.size / expected.length;
  return {
    recall: +(recall * 100).toFixed(1),
    itemCount: extracted.length,
    expectedMin: oracle.min_item_count,
    expectedMax: oracle.max_item_count,
    countWithinRange: extracted.length >= oracle.min_item_count && extracted.length <= oracle.max_item_count,
    matchedCount: matchedOracle.size,
    missed: expected.filter((_, i) => !matchedOracle.has(i)).map((e) => e.label),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const ci = args.includes('--ci');
  const models = args.filter((a) => !a.startsWith('--'));
  if (models.length === 0) {
    console.error('Usage: node harness.mjs <model1> [model2] ... [--ci]');
    process.exit(1);
  }

  await fs.mkdir(RUNS, { recursive: true });
  const baseline = ci
    ? JSON.parse(await fs.readFile(path.join(EVAL_ROOT, 'baseline.json'), 'utf-8').catch(() => '{}'))
    : null;

  const fixtureFiles = (await fs.readdir(FIXTURES)).filter((f) => f.endsWith('.jpg')).sort();
  const oracles = {};
  for (const f of fixtureFiles) {
    const name = f.replace('.jpg', '');
    oracles[name] = JSON.parse(await fs.readFile(path.join(ORACLES, `${name}.json`), 'utf-8'));
  }

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
      const runResult = useEndpoint ? await runPipelineEndpoint(imagePath) : await runModel(model, imagePath);
      if (runResult.error) {
        failures++;
        console.log(`ERROR (${runResult.elapsedMs}ms): ${runResult.error.slice(0, 80)}`);
        summary[model].perFixture.push({ fixture: name, error: runResult.error, elapsedMs: runResult.elapsedMs });
        continue;
      }
      const extracted = extractJson(runResult.text);
      const score = scoreRun(extracted, oracles[name]);
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
