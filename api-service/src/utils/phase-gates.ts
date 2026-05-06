/**
 * Phase-gate lints — post section-10 invariant set.
 *
 * Section-10 deletion removed the Temporal orchestration path. The flag
 * `USE_PIPELINE_SERVICE` is gone, the pipeline-service sidecar is the
 * only path. These lints make sure none of the deleted artifacts get
 * accidentally re-introduced by a future PR.
 *
 *   src/temporal/                          must stay deleted
 *   src/providers/                         must stay deleted
 *   src/schemas/detection.schema.ts        must stay deleted
 *   src/services/image-quality.service.ts  must stay deleted (mobile owns it)
 *   src/services/translation/              must stay deleted
 *   USE_PIPELINE_SERVICE references in src must stay deleted
 *   @temporalio/* imports                  must stay deleted
 *   src/utils/circuit-breaker.ts           MUST CONTINUE TO EXIST
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

// The phase-gate utility itself, and its test, both contain the regex
// patterns as string literals. Skip them — they're the lint, not the
// lint target.
const SELF_REFERENCE_FILES = new Set([
  'utils/phase-gates.ts',
  '__tests__/unit/phase-gates.test.ts',
]);

function findReferences(rootDir: string, needles: RegExp[]): Array<{ file: string; needle: string }> {
  const hits: Array<{ file: string; needle: string }> = [];
  for (const file of walkTs(rootDir)) {
    const rel = path.relative(rootDir, file);
    if (SELF_REFERENCE_FILES.has(rel)) continue;
    let body = '';
    try {
      body = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const needle of needles) {
      if (needle.test(body)) {
        hits.push({ file, needle: needle.source });
      }
    }
  }
  return hits;
}

interface PathSet {
  temporal: string;
  providers: string;
  detectionSchema: string;
  imageQualitySvc: string;
  translationSvc: string;
  circuitBreaker: string;
}

function _paths(src: string): PathSet {
  return {
    temporal: path.join(src, 'temporal'),
    providers: path.join(src, 'providers'),
    detectionSchema: path.join(src, 'schemas', 'detection.schema.ts'),
    imageQualitySvc: path.join(src, 'services', 'image-quality.service.ts'),
    translationSvc: path.join(src, 'services', 'translation'),
    circuitBreaker: path.join(src, 'utils', 'circuit-breaker.ts'),
  };
}

export function runPhaseGates(opts?: {
  srcDir?: string;
}): GateResult {
  const src = opts?.srcDir ?? DEFAULT_SRC_DIR;
  const paths = _paths(src);

  const failures: string[] = [];
  const warnings: string[] = [];

  // Forbidden directory/file presence.
  const FORBIDDEN_DIRS_FILES: Array<[string, string]> = [
    [paths.temporal, 'src/temporal/ — section-10 deleted Temporal orchestration; do not reintroduce'],
    [paths.providers, 'src/providers/ — section-10 deleted legacy provider adapters'],
    [paths.detectionSchema, 'src/schemas/detection.schema.ts — section-10 deleted'],
    [paths.imageQualitySvc, 'src/services/image-quality.service.ts — section-08 moved to mobile'],
    [paths.translationSvc, 'src/services/translation/ — section-10 deleted (legacy-shape translator)'],
  ];
  for (const [target, msg] of FORBIDDEN_DIRS_FILES) {
    if (existsSync(target)) failures.push(msg);
  }

  // Required files that must NOT disappear.
  if (!existsSync(paths.circuitBreaker)) {
    failures.push(
      'src/utils/circuit-breaker.ts is missing. It is KEPT for the ' +
        'pipeline.client wrapper. Restore the file.',
    );
  }

  // Forbidden import / symbol references.
  const FORBIDDEN_NEEDLES = [
    /from ['"]@temporalio\//,
    /require\(['"]@temporalio\//,
    /\bUSE_PIPELINE_SERVICE\b/,
    /from ['"][^'"]*\/temporal\//,
    /\bEnrichedItem\b/,
    /\bDetectResult\b/,
  ];
  const refHits = findReferences(src, FORBIDDEN_NEEDLES);
  for (const { file, needle } of refHits) {
    failures.push(
      `Forbidden reference /${needle}/ in ${path.relative(src, file)} — section-10 invariant violated`,
    );
  }

  if (failures.length === 0) {
    warnings.push('Section-10 post-state: pipeline-service is the only path, Temporal removed.');
  }

  return { ok: failures.length === 0, failures, warnings };
}
