/**
 * Phase-gate lints for the structural pipeline rewrite.
 *
 * Section-02 introduced the flag-vs-temporal coherence rule:
 *
 *   USE_PIPELINE_SERVICE referenced  AND  src/temporal/ exists  → OK (pre-Phase-5)
 *   USE_PIPELINE_SERVICE removed     AND  src/temporal/ missing → OK (post-Phase-5)
 *   USE_PIPELINE_SERVICE removed     AND  src/temporal/ exists  → FAIL
 *   USE_PIPELINE_SERVICE referenced  AND  src/temporal/ missing → FAIL
 *
 * Section-10 EXTENDS this with deletion-coherence rules. Either the whole
 * Phase-5 set is removed together, or none of it is:
 *
 *   src/temporal/                    must be removed when flag is removed
 *   src/providers/                   must be removed when flag is removed
 *   src/schemas/detection.schema.ts  must be removed when flag is removed
 *   src/services/image-quality.service.ts  must be removed when flag is removed
 *   src/services/translation/        must be removed when flag is removed
 *   src/utils/circuit-breaker.ts     MUST CONTINUE TO EXIST (kept for the
 *                                    pipeline.client wrapper)
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
  temporalDir?: string;
}): GateResult {
  const src = opts?.srcDir ?? DEFAULT_SRC_DIR;
  const paths = _paths(src);
  const temporal = opts?.temporalDir ?? paths.temporal;

  const flagOn = flagReferenced(src);
  const temporalOn = existsSync(temporal);
  const providersOn = existsSync(paths.providers);
  const detectionSchemaOn = existsSync(paths.detectionSchema);
  const imageQualitySvcOn = existsSync(paths.imageQualitySvc);
  const translationSvcOn = existsSync(paths.translationSvc);
  const circuitBreakerOn = existsSync(paths.circuitBreaker);

  const failures: string[] = [];
  const warnings: string[] = [];

  // Flag/temporal coherence (section-02).
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

  // circuit-breaker.ts is KEPT — wired around pipeline.client.ts. If it
  // disappears at any point, the pipeline-service path loses its
  // fast-fail surface and Fastify will time out per-request on sidecar
  // outages instead of returning 503 quickly.
  if (!circuitBreakerOn) {
    failures.push(
      'src/utils/circuit-breaker.ts is missing. It is KEPT in section-10 ' +
        '(wired around pipeline.client.ts). Restore the file or fix the ' +
        'import path.',
    );
  }

  // Section-10 deletion-coherence: when the flag is gone (Phase 5 done),
  // every deletion target must also be gone. When the flag remains,
  // deletion targets may still be present (pre-Phase-5).
  if (!flagOn) {
    if (providersOn) {
      failures.push(
        'src/providers/ still exists but USE_PIPELINE_SERVICE has been ' +
          'removed. Section-10 deletion-coherence: delete src/providers/ ' +
          'or re-introduce the flag.',
      );
    }
    if (detectionSchemaOn) {
      failures.push(
        'src/schemas/detection.schema.ts still exists but USE_PIPELINE_SERVICE ' +
          'has been removed. Section-10 deletion-coherence violated.',
      );
    }
    if (imageQualitySvcOn) {
      failures.push(
        'src/services/image-quality.service.ts still exists but ' +
          'USE_PIPELINE_SERVICE has been removed (image quality moved to ' +
          'mobile per section-08).',
      );
    }
    if (translationSvcOn) {
      failures.push(
        'src/services/translation/ still exists but USE_PIPELINE_SERVICE has ' +
          'been removed. The legacy-shape translator was a Phase-6→Phase-5 ' +
          'window-only file; it must be deleted by section-10.',
      );
    }
  }

  if (flagOn && temporalOn) {
    warnings.push('Pre-Phase-5 state detected: dual code paths active.');
  }
  if (!flagOn && !temporalOn) {
    warnings.push('Post-Phase-5 state detected: pipeline-service is the only path.');
  }

  return { ok: failures.length === 0, failures, warnings };
}
