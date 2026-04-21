import { describe, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from '@temporalio/worker';

describe('detectInventoryWorkflow — replay', () => {
  const historiesDir = path.resolve(__dirname, 'histories');
  const histories = fs.existsSync(historiesDir)
    ? fs.readdirSync(historiesDir).filter((f) => f.endsWith('.json'))
    : [];

  if (histories.length === 0) {
    it.skip('no recorded histories yet — re-generate with record-happy-path.ts', () => {});
    return;
  }

  for (const filename of histories) {
    it(`replays ${filename} deterministically`, async () => {
      const historyJson = JSON.parse(
        fs.readFileSync(path.join(historiesDir, filename), 'utf-8'),
      );
      // Worker.runReplayHistory throws if replay diverges from the recorded path.
      await Worker.runReplayHistory(
        {
          workflowsPath: path.resolve(
            __dirname,
            '../../temporal/workflows/detect-inventory.workflow.ts',
          ),
        },
        historyJson,
      );
    }, 60_000);
  }
});
