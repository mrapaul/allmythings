/**
 * Phase-gate lints for the structural pipeline rewrite.
 *
 * Section-02 enforces the flag-vs-temporal coherence rule:
 *
 *   USE_PIPELINE_SERVICE referenced  AND  src/temporal/ exists  → OK (pre-Phase-5)
 *   USE_PIPELINE_SERVICE removed     AND  src/temporal/ missing → OK (post-Phase-5)
 *   USE_PIPELINE_SERVICE removed     AND  src/temporal/ exists  → FAIL
 *   USE_PIPELINE_SERVICE referenced  AND  src/temporal/ missing → FAIL
 *
 * Section-10 will extend this with deletion gates for translation/, the
 * legacy schema/services, and TEMPORAL/TIER env-var deletions.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const existsSync = fs.existsSync;
const readdirSync = fs.readdirSync;
const readFileSync = fs.readFileSync;
const statSync = fs.statSync;

const DEFAULT_SERVICE_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_SRC_DIR = path.join(DEFAULT_SERVICE_ROOT, 'src');

export interface GateResult {
  ok: boolean;
  failures: string[];
  warnings: string[];
}

function* walkTs(root: string): Generator<string> {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root)) {
    const full = path.join(root, entry);
    let s: fs.Stats;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      yield* walkTs(full);
    } else if (s.isFile() && full.endsWith('.ts')) {
      yield full;
    }
  }
}

function flagReferenced(rootDir: string): boolean {
  const NEEDLE = 'USE_PIPELINE_SERVICE';
  for (const file of walkTs(rootDir)) {
    let body = '';
    try {
      body = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (body.includes(NEEDLE)) return true;
  }
  return false;
}

export function runPhaseGates(opts?: {
  srcDir?: string;
  temporalDir?: string;
}): GateResult {
  const src = opts?.srcDir ?? DEFAULT_SRC_DIR;
  const temporal = opts?.temporalDir ?? path.join(src, 'temporal');

  const flagOn = flagReferenced(src);
  const temporalOn = existsSync(temporal);

  const failures: string[] = [];
  const warnings: string[] = [];

  if (flagOn && !temporalOn) {
    failures.push(
      'USE_PIPELINE_SERVICE is still referenced in src/ but src/temporal/ ' +
        "has been removed. Section-10 has run; section-02's flag must be " +
        'removed too. Remove the env-var references and any flag-gated branches.',
    );
  }
  if (!flagOn && temporalOn) {
    failures.push(
      'src/temporal/ still exists but USE_PIPELINE_SERVICE has been removed ' +
        'from src/. Section-10 was incomplete — either re-introduce the flag ' +
        'or delete src/temporal/.',
    );
  }
  if (flagOn && temporalOn) {
    warnings.push('Pre-Phase-5 state detected: dual code paths active.');
  }
  if (!flagOn && !temporalOn) {
    warnings.push('Post-Phase-5 state detected: pipeline-service is the only path.');
  }

  return { ok: failures.length === 0, failures, warnings };
}
