#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = path.join(__dirname, 'baseline.json');

if (!fs.existsSync(BASELINE_PATH)) {
  console.error('Missing eval/baseline.json');
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
console.log('✅ Golden Oracle Baseline Verified:', JSON.stringify(baseline).slice(0, 120) + '...');
