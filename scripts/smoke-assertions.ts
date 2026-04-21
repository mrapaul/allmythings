// @ts-nocheck
/**
 * Smoke assertions — run against a live stack.
 * Usage: cd api-service && npx tsx ../scripts/smoke-assertions.ts [--fixture path] [--api-url http://localhost:14000]
 *
 * This file sits at repo root /scripts/ which has no tsconfig of its own.
 * Running via tsx from api-service picks up @types/node and fetch/FormData
 * DOM types automatically. Editor LSP outside that context can't see them,
 * hence @ts-nocheck — this is a script, not compiled library code.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

interface SmokeResult {
  name: string;
  ok: boolean;
  detail: string;
  durationMs: number;
}

const apiUrl = argOf('--api-url') ?? 'http://localhost:14000';
const fixture = argOf('--fixture') ?? 'api-service/src/__tests__/fixtures/room_01.jpg';
const runsDir = path.join(os.homedir(), 'allmythings-data', 'smoke-runs');

const SLOs = {
  workflowSuccessRatePct: 99,
  p95LatencyMs: 25_000,
  p99LatencyMs: 45_000,
  tier1RatePct: 80,
};

async function main(): Promise<void> {
  const results: SmokeResult[] = [];
  const addResult = (name: string, ok: boolean, detail: string, durationMs = 0): void => {
    results.push({ name, ok, detail, durationMs });
    console.log(`  ${ok ? '✓' : '✗'} ${name} — ${detail}${durationMs ? ` (${durationMs}ms)` : ''}`);
  };

  // Happy path
  const absFixture = path.isAbsolute(fixture) ? fixture : path.resolve(process.cwd(), fixture);
  if (!fs.existsSync(absFixture)) {
    console.error(`Fixture not found: ${absFixture}`);
    process.exit(2);
  }
  const imgBuf = fs.readFileSync(absFixture);
  const form1 = new FormData();
  form1.append('file', new Blob([imgBuf], { type: 'image/jpeg' }), path.basename(absFixture));
  const t1 = Date.now();
  const res1 = await fetch(`${apiUrl}/v1/detect`, { method: 'POST', body: form1 });
  const body1Text = await res1.text();
  let body1: Record<string, unknown>;
  try { body1 = JSON.parse(body1Text) as Record<string, unknown>; } catch { body1 = {}; }
  const dur1 = Date.now() - t1;

  if (res1.status === 200) {
    addResult('happy_path_status_200', true, `200 in ${dur1}ms`, dur1);
    addResult('response_shape', Boolean(body1.photoId) && Array.isArray(body1.items),
      `itemCount=${(body1.items as unknown[] | undefined)?.length ?? 0}`);
    addResult('slo_p95_latency', dur1 <= SLOs.p95LatencyMs,
      `${dur1}ms <= ${SLOs.p95LatencyMs}ms`, dur1);
    const items = (body1.items as Array<{ enrichmentTier?: string }> | undefined) ?? [];
    const tier1Count = items.filter((i) => i.enrichmentTier === 'qwen7b').length;
    const total = items.length;
    const tier1Pct = total > 0 ? (tier1Count / total) * 100 : 0;
    addResult('slo_tier1_rate',
      total === 0 || tier1Pct >= SLOs.tier1RatePct,
      `${tier1Pct.toFixed(0)}% tier-1${total === 0 ? ' (0 items — unseeded fixture)' : ''}`);
  } else if (res1.status === 202) {
    addResult('happy_path_accepted_202', true, `202 workflowId=${String(body1.workflowId)}`, dur1);
  } else {
    addResult('happy_path_status_200', false, `got ${res1.status}: ${body1Text.slice(0, 200)}`, dur1);
  }

  // Idempotency (same image again)
  const form2 = new FormData();
  form2.append('file', new Blob([imgBuf], { type: 'image/jpeg' }), path.basename(absFixture));
  const t2 = Date.now();
  const res2 = await fetch(`${apiUrl}/v1/detect`, { method: 'POST', body: form2 });
  const body2Text = await res2.text();
  let body2: Record<string, unknown>;
  try { body2 = JSON.parse(body2Text) as Record<string, unknown>; } catch { body2 = {}; }
  const dur2 = Date.now() - t2;
  const sameId = Boolean(body1.photoId && body2.photoId && body1.photoId === body2.photoId);
  addResult('idempotency',
    sameId || res2.status === 202,
    sameId ? 'same photoId reused' : `status=${res2.status}; photoIds ${String(body1.photoId)} vs ${String(body2.photoId)}`,
    dur2);

  // Trace correlation — does Tempo see our trace_id?
  const traceId = body1.traceId as string | undefined;
  if (traceId) {
    try {
      const tempoRes = await fetch(`http://localhost:3200/api/traces/${traceId}`);
      addResult('trace_in_tempo', tempoRes.ok,
        tempoRes.ok ? 'trace present in Tempo' : `Tempo returned ${tempoRes.status}`);
    } catch (e) {
      addResult('trace_in_tempo', false, `error: ${(e as Error).message}`);
    }
  }

  // Write run + rolling SLO gate
  fs.mkdirSync(runsDir, { recursive: true });
  const runFile = path.join(runsDir, `${Date.now()}.json`);
  fs.writeFileSync(runFile, JSON.stringify(results, null, 2));

  // Prune to last 100
  const runs = fs.readdirSync(runsDir).filter((f) => f.endsWith('.json')).sort();
  if (runs.length > 100) {
    runs.slice(0, runs.length - 100).forEach((f) => fs.unlinkSync(path.join(runsDir, f)));
  }

  // Rolling SLO gate over last 100
  const last100 = fs.readdirSync(runsDir).filter((f) => f.endsWith('.json')).sort().slice(-100)
    .map((f) => JSON.parse(fs.readFileSync(path.join(runsDir, f), 'utf-8')) as SmokeResult[]);
  const allOkCount = last100.filter((r) => r.every((x) => x.ok)).length;
  const successPct = last100.length > 0 ? (allOkCount / last100.length) * 100 : 0;
  const sloGate = successPct >= SLOs.workflowSuccessRatePct;
  console.log(`\nRolling SLO: ${successPct.toFixed(1)}% success over last ${last100.length} runs (target ≥ ${SLOs.workflowSuccessRatePct}%)`);

  const anyFail = results.some((r) => !r.ok);
  process.exit(anyFail || !sloGate ? 1 : 0);
}

function argOf(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

main().catch((e: unknown) => { console.error(e); process.exit(1); });
