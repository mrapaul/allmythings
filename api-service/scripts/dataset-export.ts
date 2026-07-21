/**
 * Export the corrections flywheel as a COCO detection dataset.
 *
 * Reads `<PHOTO_DIR>/flywheel/*.jsonl` + `<PHOTO_DIR>/photos/<sha>.*`, writes
 * `<repo>/datasets/export-YYYY-MM-DD/{images/, annotations.json}`. Prints
 * every count so nothing is dropped silently.
 *
 * Usage: npx tsx scripts/dataset-export.ts
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { envConfig } from '../src/config/env.config';
import {
  flywheelToCoco,
  latestRecordPerPhoto,
  type FlywheelRecord,
  type ImageDims,
} from '../src/services/flywheel-coco';

async function main(): Promise<void> {
  const flywheelDir = path.join(envConfig.photoDir, 'flywheel');
  const photosDir = path.join(envConfig.photoDir, 'photos');
  const exportDir = path.join(
    __dirname,
    '..',
    '..',
    'datasets',
    `export-${new Date().toISOString().slice(0, 10)}`,
  );

  let files: string[] = [];
  try {
    files = (await fs.readdir(flywheelDir)).filter((f) => f.endsWith('.jsonl')).sort();
  } catch {
    console.error(`No flywheel directory at ${flywheelDir} — nothing to export.`);
    process.exit(1);
  }

  const records: FlywheelRecord[] = [];
  let badLines = 0;
  for (const f of files) {
    const text = await fs.readFile(path.join(flywheelDir, f), 'utf-8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        records.push(JSON.parse(line) as FlywheelRecord);
      } catch {
        badLines += 1;
      }
    }
  }

  const latest = latestRecordPerPhoto(records);
  const dims = new Map<string, ImageDims>();
  const missingPhotos: string[] = [];
  await fs.mkdir(path.join(exportDir, 'images'), { recursive: true });

  for (const rec of latest) {
    const candidates = ['jpg', 'png', 'webp'].map((ext) => `${rec.photoSha256}.${ext}`);
    let found = false;
    for (const name of candidates) {
      const src = path.join(photosDir, name);
      try {
        const meta = await sharp(src).metadata();
        if (!meta.width || !meta.height) continue;
        dims.set(rec.photoSha256, { width: meta.width, height: meta.height, fileName: name });
        await fs.copyFile(src, path.join(exportDir, 'images', name));
        found = true;
        break;
      } catch {
        // try next extension
      }
    }
    if (!found) missingPhotos.push(rec.photoSha256);
  }

  const coco = flywheelToCoco(records, dims);
  await fs.writeFile(
    path.join(exportDir, 'annotations.json'),
    JSON.stringify(coco, null, 2),
    'utf-8',
  );

  console.log(`Flywheel files read:   ${files.length}`);
  console.log(`Records read:          ${records.length} (${badLines} unparseable lines skipped)`);
  console.log(`Unique photos:         ${latest.length}`);
  console.log(`Photos found/copied:   ${dims.size}`);
  console.log(`Photos MISSING:        ${missingPhotos.length}${missingPhotos.length ? ` → ${missingPhotos.join(', ')}` : ''}`);
  console.log(`Annotations written:   ${coco.annotations.length}`);
  console.log(`Dataset:               ${exportDir}`);
}

void main();
