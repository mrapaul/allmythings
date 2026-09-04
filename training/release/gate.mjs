// Pure release-gate logic: promotion decision, model card rendering, registry
// transitions. No I/O — promote.mjs does the file work and shells out.

export const DEFAULT_RECALL_FLOOR = 96.1; // incumbent: base model in full pipeline
export const COLLAPSE_RECALL_FLOOR = 90; // single-call recall that justifies dropping tiling
export const COLLAPSE_MIN_SPEEDUP = 3; // must be at least this much faster than the pipeline
export const DEFAULT_DUP_TOLERANCE = 0.02;

function dupRegression(candidate, incumbent, dupTolerance) {
  if (!incumbent || typeof incumbent.avgDuplicateRate !== 'number') return null;
  if (typeof candidate.avgDuplicateRate !== 'number') return null;
  const limit = incumbent.avgDuplicateRate + dupTolerance;
  if (candidate.avgDuplicateRate <= limit) return null;
  return (
    `duplicate rate ${candidate.avgDuplicateRate} worse than incumbent ` +
    `${incumbent.avgDuplicateRate} (+${dupTolerance} tolerance)`
  );
}

/**
 * Two independent promotion paths, because the product prize is not recall:
 *
 *  - "pipeline-model": a like-for-like replacement of the model inside the
 *    existing pipeline. Requires candidate-in-pipeline >= the incumbent floor
 *    and no duplicate-rate regression.
 *
 *  - "pipeline-collapse": the real goal. A candidate whose SINGLE CALL reaches
 *    near-pipeline recall lets tiling and/or pass-2 be switched off, trading a
 *    couple of recall points for a ~10x latency win on the app's most-felt
 *    friction. Requires single-call recall >= COLLAPSE_RECALL_FLOOR and
 *    >= COLLAPSE_MIN_SPEEDUP versus the incumbent's latency.
 *
 * Collapse wins when both qualify: the latency win is worth more than the
 * recall points, and it is the objective the training exists to serve.
 */
export function evaluateGate({
  candidateRaw,
  candidatePipeline,
  incumbent,
  recallFloor = DEFAULT_RECALL_FLOOR,
  collapseRecallFloor = COLLAPSE_RECALL_FLOOR,
  collapseMinSpeedup = COLLAPSE_MIN_SPEEDUP,
  dupTolerance = DEFAULT_DUP_TOLERANCE,
}) {
  if (!candidateRaw && !candidatePipeline) {
    return {
      pass: false,
      promotionBasis: null,
      reasons: ['no candidate scores in either configuration'],
      paths: {},
    };
  }

  const pipelineReasons = [];
  if (!candidatePipeline || typeof candidatePipeline.avgRecall !== 'number') {
    pipelineReasons.push('no candidate-pipeline result (point api-service at the candidate and rerun)');
  } else {
    if (candidatePipeline.failures > 0) {
      pipelineReasons.push(`candidate-pipeline had ${candidatePipeline.failures} fixture failure(s)`);
    }
    if (candidatePipeline.avgRecall < recallFloor) {
      pipelineReasons.push(
        `candidate-pipeline recall ${candidatePipeline.avgRecall}% below incumbent floor ${recallFloor}%`,
      );
    }
    const dup = dupRegression(candidatePipeline, incumbent, dupTolerance);
    if (dup) pipelineReasons.push(dup);
  }

  const collapseReasons = [];
  let speedup = null;
  if (!candidateRaw || typeof candidateRaw.avgRecall !== 'number') {
    collapseReasons.push('no candidate-raw single-call result');
  } else {
    if (candidateRaw.failures > 0) {
      collapseReasons.push(`candidate-raw had ${candidateRaw.failures} fixture failure(s)`);
    }
    if (candidateRaw.avgRecall < collapseRecallFloor) {
      collapseReasons.push(
        `single-call recall ${candidateRaw.avgRecall}% below collapse floor ${collapseRecallFloor}%`,
      );
    }
    if (!incumbent || !incumbent.avgLatencyMs || !candidateRaw.avgLatencyMs) {
      collapseReasons.push('cannot compute speedup without incumbent and candidate latencies');
    } else {
      speedup = +(incumbent.avgLatencyMs / candidateRaw.avgLatencyMs).toFixed(2);
      if (speedup < collapseMinSpeedup) {
        collapseReasons.push(
          `speedup ${speedup}x below required ${collapseMinSpeedup}x versus incumbent`,
        );
      }
    }
    const dup = dupRegression(candidateRaw, incumbent, dupTolerance);
    if (dup) collapseReasons.push(dup);
  }

  const paths = {
    'pipeline-collapse': { pass: collapseReasons.length === 0, reasons: collapseReasons, speedup },
    'pipeline-model': { pass: pipelineReasons.length === 0, reasons: pipelineReasons },
  };
  const basis = paths['pipeline-collapse'].pass
    ? 'pipeline-collapse'
    : paths['pipeline-model'].pass
      ? 'pipeline-model'
      : null;
  return {
    pass: basis !== null,
    promotionBasis: basis,
    speedup,
    reasons: basis ? [] : [...collapseReasons, ...pipelineReasons],
    paths,
  };
}

export function nextVersion(registry) {
  const versions = (registry?.entries ?? [])
    .map((e) => Number.parseInt(String(e.version).replace(/^v/, ''), 10))
    .filter((n) => Number.isFinite(n));
  return `v${(versions.length ? Math.max(...versions) : 0) + 1}`;
}

export function activeEntry(registry) {
  return (registry?.entries ?? []).find((e) => e.status === 'active') ?? null;
}

/** Adding an entry archives whatever was active — exactly one active entry. */
export function addEntry(registry, entry) {
  const entries = (registry?.entries ?? []).map((e) =>
    e.status === 'active' ? { ...e, status: 'archived' } : e,
  );
  return { entries: [...entries, { ...entry, status: 'active' }] };
}

/**
 * Roll back to the most recently archived entry: it becomes active and the
 * current active becomes archived. No-op result when there is nothing to
 * roll back to.
 */
export function rollback(registry) {
  const entries = registry?.entries ?? [];
  const activeIdx = entries.findIndex((e) => e.status === 'active');
  let targetIdx = -1;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (i !== activeIdx && entries[i].status === 'archived') {
      targetIdx = i;
      break;
    }
  }
  if (targetIdx === -1) {
    return { registry: { entries }, from: null, to: null };
  }
  const updated = entries.map((e, i) => {
    if (i === activeIdx) return { ...e, status: 'archived' };
    if (i === targetIdx) return { ...e, status: 'active' };
    return e;
  });
  return {
    registry: { entries: updated },
    from: activeIdx === -1 ? null : entries[activeIdx],
    to: entries[targetIdx],
  };
}

function collapseSection(gate, benchmark) {
  const byConfig = (c) => (benchmark?.results ?? []).find((r) => r.config === c)?.aggregate ?? null;
  const raw = byConfig('candidate-raw');
  const incumbent = byConfig('base-pipeline');
  if (gate.promotionBasis !== 'pipeline-collapse') {
    return [
      '## Pipeline configuration',
      '',
      'Promoted as a **pipeline-model** replacement: the model changes, the',
      'pipeline (two-pass + adaptive tiling + dedupe) stays ON. Do not disable',
      'tiling or pass-2 on the basis of this card.',
    ].join('\n');
  }
  return [
    '## Pipeline collapse — tiling/pass-2 may be DISABLED',
    '',
    'Promoted as a **pipeline-collapse** candidate: single-call output reaches',
    'near-pipeline recall, so the tiling and second pass exist to buy accuracy',
    'this model no longer needs.',
    '',
    `- single-call recall: **${raw ? raw.avgRecall : 'n/a'}%** @ ${raw ? (raw.avgLatencyMs / 1000).toFixed(1) : '?'}s`,
    `- incumbent pipeline: ${incumbent ? incumbent.avgRecall : 'n/a'}% @ ${incumbent ? (incumbent.avgLatencyMs / 1000).toFixed(1) : '?'}s`,
    `- measured speedup: **${gate.speedup ?? 'n/a'}x**`,
    '',
    'To collapse the pipeline in api-service configuration (never edited by this',
    'tooling): set `VLM_TWO_PASS=false` and disable adaptive tiling. Re-run the',
    'oracle eval after the change — the numbers above justify it, they do not',
    'prove the collapsed configuration in production.',
  ].join('\n');
}

export function renderModelCard({
  version, candidateName, baseModel, loraConfig, datasetComposition,
  benchmark, gate, gitSha, date, artifactPath, limitations = [],
}) {
  const rows = (benchmark?.results ?? [])
    .slice()
    .sort((a, b) => b.aggregate.avgRecall - a.aggregate.avgRecall)
    .map(
      (r) =>
        `| ${r.name} | ${r.config ?? '-'} | ${r.aggregate.avgRecall.toFixed(1)} | ` +
        `${r.aggregate.countAccuracy.toFixed(1)} | ${r.aggregate.avgDuplicateRate.toFixed(3)} | ` +
        `${(r.aggregate.avgLatencyMs / 1000).toFixed(1)}s | ` +
        `${(r.aggregate.recallPerSecond ?? 0).toFixed(2)} | ${r.license} |`,
    );
  const datasetRows = (datasetComposition ?? []).map(
    (d) => `| ${d.name} | ${d.images} | ${d.annotations} | ${d.license} |`,
  );
  return `# Model card — ${candidateName} (${version})

- **Date**: ${date}
- **Git SHA**: ${gitSha}
- **Base model**: ${baseModel}
- **Artifact**: ${artifactPath}
- **Gate**: ${gate.pass ? 'PASS' : 'FAIL'}${gate.reasons.length ? ` — ${gate.reasons.join('; ')}` : ''}
- **Promotion basis**: ${gate.promotionBasis ?? 'none'}

## LoRA configuration

\`\`\`yaml
${loraConfig.trim()}
\`\`\`

## Dataset composition

| Source | Images | Annotations | License |
| --- | --- | --- | --- |
${datasetRows.join('\n') || '| (none recorded) | 0 | 0 | — |'}

Training objective: **pipeline distillation**. Where a flywheel photo carries
human-verified merged pipeline output (tiled + deduped), that full item set is
used as the single-call target — teaching dense, complete enumeration from one
full-frame view so the tiled pipeline becomes unnecessary.

## Benchmark (home-inventory oracle, ${benchmark?.fixtures ?? 0} fixtures)

| Model | Config | Recall% | CountAcc% | DupRate | Latency | Recall/s | License |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n') || '| (no results) | — | — | — | — | — | — | — |'}

${collapseSection(gate, benchmark)}

## Known limitations

${(limitations.length ? limitations : [
  'Oracle is 8 fixtures — a narrow accuracy signal; treat small deltas as noise.',
  'Recall uses token-overlap matching, which credits partially correct labels.',
  'Duplicate rate is ~0 for any model prompted to emit counts rather than one entry per instance; it only discriminates for per-instance emitters like the pipeline.',
  'Brand and era/vintage attributes are VLM-inferred, never verified against a product database.',
  'Reference detectors in the table are AGPL or promptable-only and are not shippable.',
]).map((l) => `- ${l}`).join('\n')}
`;
}
