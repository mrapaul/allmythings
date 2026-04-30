import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runPhaseGates } from '../../utils/phase-gates';

interface ProjectOpts {
  withFlagRef?: boolean;
  withTemporalDir?: boolean;
  withProviders?: boolean;
  withDetectionSchema?: boolean;
  withImageQualitySvc?: boolean;
  withTranslationSvc?: boolean;
  withCircuitBreaker?: boolean;
}

function makeTempProject(opts: ProjectOpts): {
  srcDir: string;
  temporalDir: string;
  cleanup: () => void;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-gates-'));
  const srcDir = path.join(root, 'src');
  const temporalDir = path.join(srcDir, 'temporal');
  fs.mkdirSync(srcDir, { recursive: true });
  // Default: circuit-breaker.ts must exist (it's KEPT). Tests that
  // explicitly want it absent set withCircuitBreaker=false.
  if (opts.withCircuitBreaker !== false) {
    fs.mkdirSync(path.join(srcDir, 'utils'), { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'utils', 'circuit-breaker.ts'),
      '// circuit breaker (kept)\n',
    );
  }
  if (opts.withTemporalDir) {
    fs.mkdirSync(temporalDir);
    fs.writeFileSync(path.join(temporalDir, 'client.ts'), '// temporal placeholder\n');
  }
  if (opts.withProviders) {
    const dir = path.join(srcDir, 'providers');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'florence.ts'), '// provider\n');
  }
  if (opts.withDetectionSchema) {
    const dir = path.join(srcDir, 'schemas');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'detection.schema.ts'), '// schema\n');
  }
  if (opts.withImageQualitySvc) {
    const dir = path.join(srcDir, 'services');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'image-quality.service.ts'), '// svc\n');
  }
  if (opts.withTranslationSvc) {
    const dir = path.join(srcDir, 'services', 'translation');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'translator.ts'), '// translator\n');
  }
  if (opts.withFlagRef) {
    fs.writeFileSync(
      path.join(srcDir, 'config.ts'),
      "export const flag = process.env.USE_PIPELINE_SERVICE === 'true';\n",
    );
  } else {
    fs.writeFileSync(path.join(srcDir, 'config.ts'), '// no flag here\n');
  }
  const cleanup = () => fs.rmSync(root, { recursive: true, force: true });
  return { srcDir, temporalDir, cleanup };
}

describe('check-phase-gates', () => {
  let cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups = [];
  });

  it('OK pre-Phase-5: flag referenced AND temporal/ exists', () => {
    const proj = makeTempProject({ withFlagRef: true, withTemporalDir: true });
    cleanups.push(proj.cleanup);
    const r = runPhaseGates({ srcDir: proj.srcDir, temporalDir: proj.temporalDir });
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes('Pre-Phase-5'))).toBe(true);
  });

  it('OK post-Phase-5: flag removed AND temporal/ removed', () => {
    const proj = makeTempProject({ withFlagRef: false, withTemporalDir: false });
    cleanups.push(proj.cleanup);
    const r = runPhaseGates({ srcDir: proj.srcDir, temporalDir: proj.temporalDir });
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes('Post-Phase-5'))).toBe(true);
  });

  it('FAIL: flag removed but temporal/ still exists (incomplete Phase-5)', () => {
    const proj = makeTempProject({ withFlagRef: false, withTemporalDir: true });
    cleanups.push(proj.cleanup);
    const r = runPhaseGates({ srcDir: proj.srcDir, temporalDir: proj.temporalDir });
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.includes('temporal/ still exists'))).toBe(true);
  });

  it('FAIL: flag still referenced but temporal/ removed (flag lingered)', () => {
    const proj = makeTempProject({ withFlagRef: true, withTemporalDir: false });
    cleanups.push(proj.cleanup);
    const r = runPhaseGates({ srcDir: proj.srcDir, temporalDir: proj.temporalDir });
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.includes('USE_PIPELINE_SERVICE is still referenced'))).toBe(true);
  });

  it('current repo state passes (pre-Phase-5)', () => {
    // Default args → SERVICE_ROOT/src + src/temporal. Both should exist
    // today (section-02 / section-10 not yet run).
    const r = runPhaseGates();
    expect(r.ok).toBe(true);
  });

  // ---- section-10 deletion-coherence rules ---------------------------------

  it('FAIL: providers/ exists post-Phase-5 (flag removed)', () => {
    const proj = makeTempProject({
      withFlagRef: false,
      withTemporalDir: false,
      withProviders: true,
    });
    cleanups.push(proj.cleanup);
    const r = runPhaseGates({ srcDir: proj.srcDir, temporalDir: proj.temporalDir });
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.includes('src/providers/ still exists'))).toBe(true);
  });

  it('FAIL: detection.schema.ts exists post-Phase-5', () => {
    const proj = makeTempProject({
      withFlagRef: false,
      withTemporalDir: false,
      withDetectionSchema: true,
    });
    cleanups.push(proj.cleanup);
    const r = runPhaseGates({ srcDir: proj.srcDir, temporalDir: proj.temporalDir });
    expect(r.ok).toBe(false);
    expect(
      r.failures.some((f) => f.includes('detection.schema.ts still exists')),
    ).toBe(true);
  });

  it('FAIL: image-quality.service.ts exists post-Phase-5', () => {
    const proj = makeTempProject({
      withFlagRef: false,
      withTemporalDir: false,
      withImageQualitySvc: true,
    });
    cleanups.push(proj.cleanup);
    const r = runPhaseGates({ srcDir: proj.srcDir, temporalDir: proj.temporalDir });
    expect(r.ok).toBe(false);
    expect(
      r.failures.some((f) => f.includes('image-quality.service.ts still exists')),
    ).toBe(true);
  });

  it('FAIL: services/translation/ exists post-Phase-5', () => {
    const proj = makeTempProject({
      withFlagRef: false,
      withTemporalDir: false,
      withTranslationSvc: true,
    });
    cleanups.push(proj.cleanup);
    const r = runPhaseGates({ srcDir: proj.srcDir, temporalDir: proj.temporalDir });
    expect(r.ok).toBe(false);
    expect(
      r.failures.some((f) => f.includes('services/translation/ still exists')),
    ).toBe(true);
  });

  it('FAIL: circuit-breaker.ts is missing (must always exist)', () => {
    const proj = makeTempProject({
      withFlagRef: true,
      withTemporalDir: true,
      withCircuitBreaker: false,
    });
    cleanups.push(proj.cleanup);
    const r = runPhaseGates({ srcDir: proj.srcDir, temporalDir: proj.temporalDir });
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.includes('circuit-breaker.ts is missing'))).toBe(true);
  });

  it('OK: pre-Phase-5 with providers + detection.schema present is acceptable', () => {
    const proj = makeTempProject({
      withFlagRef: true,
      withTemporalDir: true,
      withProviders: true,
      withDetectionSchema: true,
      withImageQualitySvc: true,
      withTranslationSvc: true,
    });
    cleanups.push(proj.cleanup);
    const r = runPhaseGates({ srcDir: proj.srcDir, temporalDir: proj.temporalDir });
    expect(r.ok).toBe(true);
  });

  it('OK: post-Phase-5 with everything deleted EXCEPT circuit-breaker.ts', () => {
    const proj = makeTempProject({
      withFlagRef: false,
      withTemporalDir: false,
      withProviders: false,
      withDetectionSchema: false,
      withImageQualitySvc: false,
      withTranslationSvc: false,
      withCircuitBreaker: true,
    });
    cleanups.push(proj.cleanup);
    const r = runPhaseGates({ srcDir: proj.srcDir, temporalDir: proj.temporalDir });
    expect(r.ok).toBe(true);
  });
});
