/**
 * Promote a corrected photo into the eval oracle so the accuracy gate grows
 * with real use.
 *
 * Copies `<PHOTO_DIR>/photos/<sha>.jpg` to `eval/fixtures/<sha>.jpg` and
 * writes `eval/oracle/<sha>.json` from the user's latest verified item set.
 *
 * Usage: npx tsx scripts/promote-fixture.ts <photoSha256>
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { envConfig } from '../src/config/env.config';
import {
  latestRecordPerPhoto,
  verifiedItems,
  type FlywheelRecord,
} from '../src/services/flywheel-coco';

async function main(): Promise<void> {
  const sha = process.argv[2];
  if (!sha || !/^[0-9a-f]{64}$/.test(sha)) {
    console.error('Usage: npx tsx scripts/promote-fixture.ts <photoSha256>');
    process.exit(1);
  }

  const flywheelDir = path.join(envConfig.photoDir, 'flywheel');
  const files = (await fs.readdir(flywheelDir)).filter((f) => f.endsWith('.jsonl')).sort();
  const records: FlywheelRecord[] = [];
  for (const f of files) {
    const text = await fs.readFile(path.join(flywheelDir, f), 'utf-8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line) as FlywheelRecord;
        if (rec.photoSha256 === sha) records.push(rec);
      } catch {
        // skip unparseable line
      }
    }
  }
  const latest = latestRecordPerPhoto(records)[0];
  if (!latest) {
    console.error(`No flywheel records found for ${sha}`);
    process.exit(1);
  }
  const items = verifiedItems(latest);
  if (items.length === 0) {
    console.error(`Record for ${sha} has no verified items — nothing to promote.`);
    process.exit(1);
  }

  const repoRoot = path.join(__dirname, '..', '..');
  const src = path.join(envConfig.photoDir, 'photos', `${sha}.jpg`);
  const fixturePath = path.join(repoRoot, 'eval', 'fixtures', `${sha}.jpg`);
  await fs.copyFile(src, fixturePath);

  const oracle = {
    fixture: `${sha}.jpg`,
    description: `Promoted from user-verified flywheel record (${latest.receivedAt})`,
    expected_items: items.map((i) => ({ label: i.label, category: i.category })),
    min_item_count: Math.max(1, Math.floor(items.length * 0.8)),
    max_item_count: Math.ceil(items.length * 1.2),
    notes: 'Auto-promoted; labels are the user-corrected ground truth.',
  };
  const oraclePath = path.join(repoRoot, 'eval', 'oracle', `${sha}.json`);
  await fs.writeFile(oraclePath, JSON.stringify(oracle, null, 2), 'utf-8');

  console.log(`Fixture: ${fixturePath}`);
  console.log(`Oracle:  ${oraclePath} (${items.length} expected items)`);
}

void main();
