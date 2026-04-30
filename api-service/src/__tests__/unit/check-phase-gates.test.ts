import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runPhaseGates } from '../../utils/phase-gates';

function makeTempProject(opts: {
  withFlagRef?: boolean;
  withTemporalDir?: boolean;
}): { srcDir: string; temporalDir: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-gates-'));
  const srcDir = path.join(root, 'src');
  const temporalDir = path.join(srcDir, 'temporal');
  fs.mkdirSync(srcDir, { recursive: true });
  if (opts.withTemporalDir) {
    fs.mkdirSync(temporalDir);
    fs.writeFileSync(path.join(temporalDir, 'client.ts'), '// temporal placeholder\n');
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
});
