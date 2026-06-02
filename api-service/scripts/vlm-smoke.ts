/**
 * Smoke runner for the two-pass VLM detector against a live Ollama instance.
 *
 * Usage:
 *   OLLAMA_BASE_URL=http://192.168.178.81:11434 OLLAMA_MODEL=qwen2.5vl:7b \
 *     npx tsx scripts/vlm-smoke.ts <image-path>
 */
import { readFileSync } from 'node:fs';
import { OllamaVlmClient } from '../src/clients/ollama-vlm.client';
import { VlmDetector } from '../src/services/vlm-detector';

async function main(): Promise<void> {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error('usage: tsx scripts/vlm-smoke.ts <image-path>');
    process.exit(1);
  }

  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  const model = process.env.OLLAMA_MODEL || 'qwen2.5vl:7b';
  const coordMode = (process.env.VLM_COORD_MODE as 'auto' | 'norm' | 'thousand' | 'pixel') || 'auto';

  const client = new OllamaVlmClient({
    baseUrl,
    model,
    timeoutMs: Number(process.env.VLM_TIMEOUT_MS || 180000),
  });
  const detector = new VlmDetector(client, {
    twoPass: process.env.VLM_TWO_PASS !== 'false',
    maxImageSize: Number(process.env.VLM_MAX_IMAGE_SIZE || 1024),
    coordMode,
  });

  console.error(`[smoke] model=${model} ollama=${baseUrl} image=${imagePath} coordMode=${coordMode}`);
  const t0 = Date.now();
  const items = await detector.detect(readFileSync(imagePath));
  const ms = Date.now() - t0;

  console.error(`\n[smoke] ${items.length} items in ${(ms / 1000).toFixed(1)}s\n`);
  for (const [i, it] of items.entries()) {
    const b = it.box;
    const box = `[${b.x.toFixed(2)},${b.y.toFixed(2)} ${b.width.toFixed(2)}x${b.height.toFixed(2)}]`;
    console.error(
      `${String(i + 1).padStart(2)}. ${it.label.padEnd(22)} ${it.category.padEnd(16)} ${box.padEnd(22)} ${it.tags.join(', ')}`,
    );
  }
  // Sanity: how many boxes are in-bounds and non-degenerate?
  const valid = items.filter(
    (it) => it.box.width > 0.001 && it.box.height > 0.001 && it.box.x >= 0 && it.box.y >= 0 && it.box.x + it.box.width <= 1.001 && it.box.y + it.box.height <= 1.001,
  ).length;
  console.error(`\n[smoke] in-bounds non-degenerate boxes: ${valid}/${items.length}`);
}

main().catch((err) => {
  console.error('[smoke] FAILED:', err);
  process.exit(1);
});
