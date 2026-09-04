// Pure scoring for the home-inventory benchmark. Recall semantics are a
// faithful replication of eval/harness.mjs (extractJson / labelsMatch /
// scoreRun) — that file runs main() at import time so it cannot be imported;
// training/tests/metrics.test.mjs pins the semantics. Never weaken these.

/** Verbatim from eval/harness.mjs. */
export function extractJson(text) {
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

/** Verbatim from eval/harness.mjs: token overlap, tokens longer than 2 chars. */
export function labelsMatch(candidate, expected) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const c = new Set(norm(candidate));
  const e = new Set(norm(expected));
  const shared = [...e].filter((t) => c.has(t) && t.length > 2);
  return shared.length >= 1;
}

/**
 * Oracle recall (harness semantics) plus the precision-proxy metrics the
 * repo harness lacks: count accuracy against the oracle's [min,max] range and
 * duplicate rate (same-label multiplicity, a known small-VLM failure mode).
 */
export function scoreFixture(extracted, oracle) {
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
  const itemCount = extracted.length;
  const min = oracle.min_item_count;
  const max = oracle.max_item_count;
  return {
    recall: +((matchedOracle.size / expected.length) * 100).toFixed(1),
    itemCount,
    expectedMin: min,
    expectedMax: max,
    countWithinRange: itemCount >= min && itemCount <= max,
    countError: itemCount < min ? min - itemCount : itemCount > max ? itemCount - max : 0,
    duplicateRate: duplicateRate(extracted),
    matchedCount: matchedOracle.size,
    missed: expected.filter((_, i) => !matchedOracle.has(i)).map((e) => e.label),
  };
}

/** Fraction of emitted items that repeat an already-seen label. 0 when empty. */
export function duplicateRate(extracted) {
  if (extracted.length === 0) return 0;
  const labels = extracted.map((i) => String(i.label ?? '').trim().toLowerCase());
  const unique = new Set(labels).size;
  return +((labels.length - unique) / labels.length).toFixed(3);
}

export function aggregate(perFixture) {
  const scored = perFixture.filter((f) => !f.error);
  const failures = perFixture.length - scored.length;
  const mean = (pick) =>
    scored.length === 0 ? 0 : scored.reduce((s, f) => s + pick(f), 0) / scored.length;
  const avgRecall = +mean((f) => f.recall).toFixed(1);
  const avgLatencyMs = Math.round(mean((f) => f.elapsedMs ?? 0));
  return {
    avgRecall,
    avgItems: +mean((f) => f.itemCount).toFixed(1),
    countAccuracy: +(mean((f) => (f.countWithinRange ? 100 : 0))).toFixed(1),
    avgCountError: +mean((f) => f.countError).toFixed(1),
    avgDuplicateRate: +mean((f) => f.duplicateRate).toFixed(3),
    avgLatencyMs,
    // Makes the accuracy/latency tradeoff explicit. The product goal is
    // PIPELINE COLLAPSE — single-call recall near pipeline level at a fraction
    // of pipeline latency — so candidates are judged on recall per second too,
    // never on recall alone.
    recallPerSecond: avgLatencyMs > 0 ? +(avgRecall / (avgLatencyMs / 1000)).toFixed(2) : 0,
    failures,
    n: perFixture.length,
  };
}

/** The four configurations any candidate must be judged across. */
export const CONFIGS = {
  CANDIDATE_RAW: 'candidate-raw',
  CANDIDATE_PIPELINE: 'candidate-pipeline',
  BASE_RAW: 'base-raw',
  BASE_PIPELINE: 'base-pipeline',
};

const COLUMNS = [
  ['Model', (r) => r.name],
  ['Config', (r) => r.config ?? '-'],
  ['Recall%', (r) => r.aggregate.avgRecall.toFixed(1)],
  ['Items', (r) => r.aggregate.avgItems.toFixed(1)],
  ['CountAcc%', (r) => r.aggregate.countAccuracy.toFixed(1)],
  ['DupRate', (r) => r.aggregate.avgDuplicateRate.toFixed(3)],
  ['Latency', (r) => `${(r.aggregate.avgLatencyMs / 1000).toFixed(1)}s`],
  ['Recall/s', (r) => r.aggregate.recallPerSecond.toFixed(2)],
  ['Fail', (r) => `${r.aggregate.failures}/${r.aggregate.n}`],
  ['License', (r) => r.license],
  ['Deploy', (r) => r.deployment],
];

export function markdownTable(results, skipped = []) {
  const ranked = [...results].sort((a, b) => b.aggregate.avgRecall - a.aggregate.avgRecall);
  const lines = [
    `| ${COLUMNS.map(([h]) => h).join(' | ')} |`,
    `| ${COLUMNS.map(() => '---').join(' | ')} |`,
  ];
  for (const r of ranked) {
    const cells = COLUMNS.map(([, pick]) => pick(r));
    lines.push(`| ${cells.join(' | ')} |${r.referenceOnly ? ' <!-- reference only -->' : ''}`);
  }
  if (skipped.length > 0) {
    lines.push('', '**Skipped contenders**', '');
    for (const s of skipped) lines.push(`- \`${s.name}\` — ${s.reason}`);
  }
  const byConfig = (c) => ranked.find((r) => r.config === c)?.aggregate ?? null;
  const candRaw = byConfig(CONFIGS.CANDIDATE_RAW);
  const incumbent = byConfig(CONFIGS.BASE_PIPELINE);
  if (candRaw && incumbent && candRaw.avgLatencyMs > 0) {
    const speedup = incumbent.avgLatencyMs / candRaw.avgLatencyMs;
    lines.push(
      '',
      '**Pipeline collapse check** — can one call replace the tiled pipeline?',
      '',
      `- candidate single-call recall: ${candRaw.avgRecall}% (target >= 90%)`,
      `- speedup vs incumbent pipeline: ${speedup.toFixed(1)}x (target >= 3x)`,
      `- incumbent pipeline: ${incumbent.avgRecall}% @ ${(incumbent.avgLatencyMs / 1000).toFixed(1)}s`,
    );
  }

  const refs = ranked.filter((r) => r.referenceOnly).map((r) => r.name);
  if (refs.length > 0) {
    lines.push(
      '',
      `> REFERENCE ONLY (not shippable): ${refs.join(', ')}. Closed-set detectors are` +
        ' scored after mapping their fixed class list into inventory labels — they cannot' +
        ' emit self-describing labels or novel categories, so recall here understates' +
        ' nothing and overstates nothing: it measures a different, easier task.',
    );
  }
  return lines.join('\n');
}
