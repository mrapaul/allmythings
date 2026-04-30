/**
 * CLI entrypoint for phase-gate lints. The actual implementation lives in
 * src/utils/phase-gates.ts so it sits inside tsconfig's rootDir.
 *
 * Run via:  npm run check-phase-gates
 */

import { runPhaseGates } from '../src/utils/phase-gates';

const result = runPhaseGates();
for (const w of result.warnings) {
  process.stderr.write(`[check-phase-gates] WARN: ${w}\n`);
}
for (const f of result.failures) {
  process.stderr.write(`[check-phase-gates] FAIL: ${f}\n`);
}
if (result.ok) {
  process.stdout.write('[check-phase-gates] OK\n');
  process.exit(0);
}
process.exit(1);
