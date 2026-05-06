import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { runPhaseGates } from '../../utils/phase-gates';

describe('section-10 phase gates', () => {
  it('current src/ tree is clean', () => {
    const result = runPhaseGates();
    if (!result.ok) {
      // Surface the actual failures so the test log is actionable.
      console.error('Phase-gate failures:\n' + result.failures.map((f) => `  - ${f}`).join('\n'));
    }
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('flags reintroduced Temporal directory', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-gate-'));
    try {
      // Mirror current src as a clean baseline, plus a forbidden temporal/ dir.
      fs.mkdirSync(path.join(tmp, 'utils'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'utils', 'circuit-breaker.ts'), '// kept');
      fs.mkdirSync(path.join(tmp, 'temporal'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'temporal', 'client.ts'), '// reintroduced');
      const result = runPhaseGates({ srcDir: tmp });
      expect(result.ok).toBe(false);
      expect(result.failures.some((f) => f.includes('temporal'))).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('flags reintroduced @temporalio/* import', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-gate-'));
    try {
      fs.mkdirSync(path.join(tmp, 'utils'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'utils', 'circuit-breaker.ts'), '// kept');
      fs.mkdirSync(path.join(tmp, 'routes'), { recursive: true });
      fs.writeFileSync(
        path.join(tmp, 'routes', 'naughty.ts'),
        "import { Client } from '@temporalio/client';\n",
      );
      const result = runPhaseGates({ srcDir: tmp });
      expect(result.ok).toBe(false);
      expect(result.failures.some((f) => f.includes('@temporalio'))).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('flags missing circuit-breaker.ts', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-gate-'));
    try {
      // No utils/circuit-breaker.ts — this should fail.
      const result = runPhaseGates({ srcDir: tmp });
      expect(result.ok).toBe(false);
      expect(result.failures.some((f) => f.includes('circuit-breaker'))).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
